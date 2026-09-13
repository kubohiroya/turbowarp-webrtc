import {describe, expect, it} from 'vitest';
import {defaultLatestDataHighWaterMark, ManualPeerSession} from '../src/manual-peer-session.js';
import {encodePairingCode, protocolVersion} from '../src/protocol.js';

class FakeDataChannel {
  public readyState: RTCDataChannelState = 'open';
  public bufferedAmount = 0;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public readonly sent: string[] = [];

  public constructor(
    public readonly label: string,
    public readonly options: RTCDataChannelInit = {}
  ) {}

  public send(value: string): void {
    this.sent.push(value);
  }

  public close(): void {
    this.readyState = 'closed';
  }
}

class FakePeerConnection {
  public connectionState: RTCPeerConnectionState = 'connected';
  public iceGatheringState: RTCIceGatheringState = 'complete';
  public localDescription: RTCSessionDescription | null = null;
  public ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public readonly channels: FakeDataChannel[] = [];

  public createDataChannel(label: string, options: RTCDataChannelInit = {}): RTCDataChannel {
    const channel = new FakeDataChannel(label, options);
    this.channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  public emitDataChannel(channel: FakeDataChannel): void {
    this.channels.push(channel);
    this.ondatachannel?.({
      channel: channel as unknown as RTCDataChannel
    } as RTCDataChannelEvent);
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {type: 'offer', sdp: 'v=0'};
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {type: 'answer', sdp: 'v=0'};
  }

  public async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = {
      type: description.type,
      sdp: description.sdp ?? '',
      toJSON: () => description
    } as RTCSessionDescription;
  }

  public async setRemoteDescription(): Promise<void> {}

  public addEventListener(): void {}

  public removeEventListener(): void {}

  public close(): void {
    this.connectionState = 'closed';
  }
}

function sessionHarness(latestDataEnabled = false): {
  session: ManualPeerSession;
  connections: FakePeerConnection[];
} {
  const connections: FakePeerConnection[] = [];
  const session = new ManualPeerSession({
    localId: 'local',
    latestDataEnabled,
    peerConnectionFactory: () => {
      const connection = new FakePeerConnection();
      connections.push(connection);
      return connection as unknown as RTCPeerConnection;
    }
  });
  return {session, connections};
}

describe('ManualPeerSession latest-data channels', () => {
  it('keeps latest-data disabled by default and preserves the reliable control channel', async () => {
    const {session, connections} = sessionHarness();
    session.configureLatestDataChannel('camera', 'pose', 1024);

    await session.createOffer('camera');

    expect(connections[0]?.channels).toHaveLength(1);
    expect(connections[0]?.channels[0]?.label).toBe('tm-events');
    expect(connections[0]?.channels[0]?.options).toEqual({ordered: true});
    expect(session.latestDataStats('camera', 'pose').state).toBe('disabled');
  });

  it('creates the offerer channel as unordered and non-retransmitting', async () => {
    const {session, connections} = sessionHarness(true);
    session.configureLatestDataChannel('camera', 'pose / main', 1024);

    await session.createOffer('camera');

    const latest = connections[0]?.channels[1];
    expect(latest?.label).toBe('tm-latest:pose%20%2F%20main');
    expect(latest?.options).toEqual({ordered: false, maxRetransmits: 0});
    expect(session.latestDataStats('camera', 'pose / main')).toMatchObject({
      state: 'open',
      highWaterMark: 1024,
      dropPolicy: 'drop-newest'
    });
  });

  it('accepts the answerer channel when opted in and uses its configured limit', async () => {
    const {session, connections} = sessionHarness(true);
    session.configureLatestDataChannel('fusion', 'pose', 2048);
    await session.acceptOffer(
      'fusion',
      encodePairingCode({
        version: protocolVersion,
        kind: 'offer',
        description: {type: 'offer', sdp: 'v=0'}
      })
    );
    const connection = connections[0]!;
    const control = new FakeDataChannel('tm-events', {ordered: true});
    const latest = new FakeDataChannel('tm-latest:pose', {
      ordered: false,
      maxRetransmits: 0
    });

    connection.emitDataChannel(control);
    connection.emitDataChannel(latest);

    expect(session.sendLatestData('fusion', 'pose', '{"frame":1}')).toBe('sent');
    expect(latest.sent).toHaveLength(1);
    expect(session.latestDataStats('fusion', 'pose')).toMatchObject({
      sentCount: 1,
      highWaterMark: 2048
    });
  });

  it('rejects incoming latest-data channels while opt-in is disabled', async () => {
    const {session, connections} = sessionHarness();
    await session.acceptOffer(
      'fusion',
      encodePairingCode({
        version: protocolVersion,
        kind: 'offer',
        description: {type: 'offer', sdp: 'v=0'}
      })
    );
    const latest = new FakeDataChannel('tm-latest:pose', {
      ordered: false,
      maxRetransmits: 0
    });

    connections[0]!.emitDataChannel(latest);

    expect(latest.readyState).toBe('closed');
    expect(session.sendLatestData('fusion', 'pose', '{}')).toBe('unavailable');
  });

  it('drops the newest value immediately above the high-water mark', async () => {
    const {session, connections} = sessionHarness(true);
    session.configureLatestDataChannel('camera', 'pose', 10);
    await session.createOffer('camera');
    const control = connections[0]!.channels[0]!;
    const latest = connections[0]!.channels[1]!;
    latest.bufferedAmount = 11;

    expect(session.sendLatestData('camera', 'pose', '{"frame":1}')).toBe('dropped');
    expect(latest.sent).toEqual([]);
    expect(session.latestDataStats('camera', 'pose')).toMatchObject({
      bufferedAmount: 11,
      sentCount: 0,
      droppedCount: 1
    });

    session.sendEvent('camera', 'control', '{}', 'default');
    expect(control.sent).toHaveLength(1);
    expect(control.options).toEqual({ordered: true});
  });

  it('uses the default limit on an unconfigured answerer channel', async () => {
    const {session, connections} = sessionHarness(true);
    await session.acceptOffer(
      'fusion',
      encodePairingCode({
        version: protocolVersion,
        kind: 'offer',
        description: {type: 'offer', sdp: 'v=0'}
      })
    );
    connections[0]!.emitDataChannel(
      new FakeDataChannel('tm-latest:pose Realm', {
        ordered: false,
        maxRetransmits: 0
      })
    );

    expect(session.latestDataStats('fusion', 'pose Realm').highWaterMark).toBe(
      defaultLatestDataHighWaterMark
    );
  });

  it('cleans up every channel on re-pair and disposal', async () => {
    const {session, connections} = sessionHarness(true);
    session.configureLatestDataChannel('camera', 'pose', 1024);
    await session.createOffer('camera');
    const firstChannels = [...connections[0]!.channels];

    await session.createOffer('camera');
    expect(firstChannels.every((channel) => channel.readyState === 'closed')).toBe(true);

    const secondChannels = [...connections[1]!.channels];
    session.closeAll();
    expect(secondChannels.every((channel) => channel.readyState === 'closed')).toBe(true);
    expect(session.connectionState('camera')).toBe('closed');
  });
});
