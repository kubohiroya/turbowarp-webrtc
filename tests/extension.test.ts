import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WebRtcManualPairingExtension} from '../src/extension.js';
import type {
  IceMode,
  InternalMessageHandler,
  MessageHandler
} from '../src/manual-peer-session.js';
import {protocolVersion, type ReceivedEnvelope} from '../src/protocol.js';
import {SyncService} from '../src/sync-service.js';
import {
  clockProbeSchema,
  createClockPing,
  frameSyncReportSchema,
  frameSyncReportVersion,
  syncChannel
} from '../src/sync-protocol.js';

type TestThread = Record<string, unknown>;
type StartHatsMock = ReturnType<
  typeof vi.fn<(opcode: string, fields?: Record<string, string>, target?: unknown) => TestThread[]>
>;

class FakeSession {
  public calls: string[] = [];
  public offers = new Map<string, string>();
  public answers = new Map<string, string>();
  public messages: string[] = ['{"type":"door-open"}'];
  private messageHandler: MessageHandler | undefined;
  private internalHandler: InternalMessageHandler | undefined;

  public setIceMode(mode: string): IceMode {
    this.calls.push(`setIceMode:${mode}`);
    return mode === 'stun' ? 'stun' : 'lan';
  }

  public async createOffer(peer: string): Promise<string> {
    this.calls.push(`createOffer:${peer}`);
    this.offers.set(peer, `offer:${peer}`);
    return `offer:${peer}`;
  }

  public getOffer(peer: string): string {
    return this.offers.get(peer) ?? '';
  }

  public async acceptOffer(peer: string, code: string): Promise<string> {
    this.calls.push(`acceptOffer:${peer}:${code}`);
    this.answers.set(peer, `answer:${peer}`);
    return `answer:${peer}`;
  }

  public getAnswer(peer: string): string {
    return this.answers.get(peer) ?? '';
  }

  public async acceptAnswer(peer: string, code: string): Promise<void> {
    this.calls.push(`acceptAnswer:${peer}:${code}`);
  }

  public sendEvent(peer: string, type: string, payload: string, channel: string): void {
    this.calls.push(`sendEvent:${peer}:${type}:${payload}:${channel}`);
  }

  public setMessageHandler(handler: MessageHandler | undefined): void {
    this.messageHandler = handler;
  }

  public setInternalHandler(handler: InternalMessageHandler | undefined): void {
    this.internalHandler = handler;
  }

  public deliverInternal(message: Partial<ReceivedEnvelope> = {}): boolean {
    return (
      this.internalHandler?.({
        version: protocolVersion,
        id: 'internal-1',
        seq: 1,
        from: 'remote-id',
        peer: 'peer-a',
        channel: 'sync',
        type: 'twmp/clock-probe',
        payload: {},
        timestamp: Date.now(),
        ...message
      }) ?? false
    );
  }

  public receive(message: Partial<ReceivedEnvelope> = {}): void {
    this.messageHandler?.({
      version: protocolVersion,
      id: 'message-1',
      seq: 1,
      from: 'remote-id',
      peer: 'peer-a',
      channel: 'default',
      type: 'door-open',
      payload: {pin: 1},
      timestamp: Date.now(),
      ...message
    });
  }

  public hasMessages(): boolean {
    return this.messages.length > 0;
  }

  public messageCount(): number {
    return this.messages.length;
  }

  public nextMessage(): string {
    return this.messages.shift() ?? '';
  }

  public lastMessage(): string {
    return this.messages[this.messages.length - 1] ?? '';
  }

  public clearMessages(): void {
    this.messages = [];
  }

  public connectionState(peer: string): string {
    return peer === 'peer-a' ? 'connected' : 'closed';
  }

  public connectedPeers(): string[] {
    return ['peer-a'];
  }

  public closePeer(peer: string): void {
    this.calls.push(`closePeer:${peer}`);
  }
}

beforeEach(() => {
  vi.stubGlobal('Scratch', {
    BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'boolean', EVENT: 'event'},
    ArgumentType: {STRING: 'string', NUMBER: 'number'},
    Cast: {
      toString: (value: unknown) => String(value),
      toNumber: (value: unknown) => Number(value)
    },
    translate: (message: string | {default: string}) => (typeof message === 'string' ? message : message.default),
    vm: {
      runtime: {
        startHats: vi.fn(() => [{}])
      }
    },
    extensions: {
      unsandboxed: true,
      register: vi.fn()
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function startHatsMock(): StartHatsMock {
  return vi.mocked(Scratch.vm!.runtime!.startHats);
}

describe('WebRtcManualPairingExtension', () => {
  it('exposes the production block surface', () => {
    const info = new WebRtcManualPairingExtension(new FakeSession()).getInfo() as {
      id: string;
      name: string;
      blocks: Array<{opcode: string; blockType: string}>;
    };

    expect(info.id).toBe('kubohiroyawebrtc');
    expect(info.name).toBe('WebRTC Manual Pairing');
    expect(info.blocks.map((block) => block.opcode)).toEqual([
      'setIceMode',
      'createOffer',
      'getOffer',
      'acceptOffer',
      'getAnswer',
      'acceptAnswer',
      'sendEvent',
      'broadcastNetworkMessage',
      'whenReceiveNetworkMessage',
      'networkMessagePayload',
      'networkMessageSender',
      'networkMessagePeer',
      'networkMessageChannel',
      'hasMessages',
      'messageCount',
      'nextMessage',
      'lastMessage',
      'clearMessages',
      'connectionState',
      'connectedPeers',
      'closePeer',
      'syncClock',
      'clockOffset',
      'clockRoundTrip',
      'clockUncertainty',
      'peerTime',
      'localTime',
      'frameLatency',
      'recordFrameSyncSample',
      'clearFrameSyncSamples',
      'frameSyncSampleCount',
      'frameSyncSummary',
      'sendFrameSyncReport',
      'frameSyncReport',
      'frameSyncCameras',
      'frameSyncLatencyOfCamera',
      'frameSyncOffsetOfCamera',
      'clearFrameSyncReport'
    ]);
  });

  it('delegates pairing and messaging to the session', async () => {
    const session = new FakeSession();
    const extension = new WebRtcManualPairingExtension(session);

    extension.setIceMode({MODE: 'stun'});
    await extension.createOffer({PEER: ' peer-a '});
    await extension.acceptOffer({PEER: 'peer-b', CODE: 'offer-code'});
    await extension.acceptAnswer({PEER: 'peer-a', CODE: 'answer-code'});
    extension.sendEvent({PEER: '*', TYPE: 'door-open', PAYLOAD: '{"pin":1}', CHANNEL: 'default'});
    extension.broadcastNetworkMessage({
      PEER: 'peer-a',
      MESSAGE: 'light-on',
      PAYLOAD: '{"brightness":80}',
      CHANNEL: 'stage'
    });

    expect(extension.getOffer({PEER: 'peer-a'})).toBe('offer:peer-a');
    expect(extension.getAnswer({PEER: 'peer-b'})).toBe('answer:peer-b');
    expect(session.calls).toEqual([
      'setIceMode:stun',
      'createOffer:peer-a',
      'acceptOffer:peer-b:offer-code',
      'acceptAnswer:peer-a:answer-code',
      'sendEvent:*:door-open:{"pin":1}:default',
      'sendEvent:peer-a:light-on:{"brightness":80}:stage'
    ]);
  });

  it('reports queue and peer state', () => {
    const session = new FakeSession();
    const extension = new WebRtcManualPairingExtension(session);

    expect(extension.hasMessages()).toBe(true);
    expect(extension.messageCount()).toBe(1);
    expect(extension.nextMessage()).toBe('{"type":"door-open"}');
    expect(extension.messageCount()).toBe(0);
    expect(extension.connectionState({PEER: 'peer-a'})).toBe('connected');
    expect(extension.connectedPeers()).toBe('["peer-a"]');
  });

  it('starts network message hats and exposes the received context', () => {
    const session = new FakeSession();
    const extension = new WebRtcManualPairingExtension(session);

    session.receive();

    expect(startHatsMock()).toHaveBeenCalledWith(
      'kubohiroyawebrtc_whenReceiveNetworkMessage',
      {MESSAGE: 'door-open'}
    );
    expect(startHatsMock()).toHaveBeenCalledWith(
      'kubohiroyawebrtc_whenReceiveNetworkMessage',
      {MESSAGE: '*'}
    );
    const firstThread = startHatsMock().mock.results[0]?.value[0] as TestThread;
    expect(extension.networkMessagePayload({}, {thread: firstThread, startHats: vi.fn()})).toBe(
      '{"pin":1}'
    );
    expect(extension.networkMessageSender({}, {thread: firstThread, startHats: vi.fn()})).toBe(
      'remote-id'
    );
    expect(extension.networkMessagePeer({}, {thread: firstThread, startHats: vi.fn()})).toBe(
      'peer-a'
    );
    expect(extension.networkMessageChannel({}, {thread: firstThread, startHats: vi.fn()})).toBe(
      'default'
    );
  });

  it('keeps network message context isolated per started thread', () => {
    const firstThread: TestThread = {};
    const secondThread: TestThread = {};
    startHatsMock()
      .mockReturnValueOnce([firstThread])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([secondThread])
      .mockReturnValueOnce([]);
    const session = new FakeSession();
    const extension = new WebRtcManualPairingExtension(session);

    session.receive({id: 'message-1', payload: {pin: 1}});
    session.receive({id: 'message-2', payload: {pin: 2}});

    expect(extension.networkMessagePayload({}, {thread: firstThread, startHats: vi.fn()})).toBe(
      '{"pin":1}'
    );
    expect(extension.networkMessagePayload({}, {thread: secondThread, startHats: vi.fn()})).toBe(
      '{"pin":2}'
    );
    expect(extension.networkMessagePayload()).toBe('{"pin":2}');
  });

  it('measures frame sync latency and reports it to the aggregating peer', () => {
    const session = new FakeSession();
    const transport = {sendEvent: vi.fn()};
    const sync = new SyncService(transport, {nowUs: () => 2_000_000});
    const extension = new WebRtcManualPairingExtension(session, sync);

    expect(extension.localTime()).toBe(2000);
    expect(
      extension.frameLatency({CAPTURE: '10', PATTERN: '4060', WRAP: '4096', PEER: 'host'})
    ).toBe(46);

    for (const latency of [40, 44, 48]) {
      extension.recordFrameSyncSample({
        CAMERA: 'camera-1',
        CAPTURE: String(1000 + latency),
        PATTERN: '1000',
        WRAP: '0',
        PEER: 'host'
      });
    }

    expect(extension.frameSyncSampleCount({CAMERA: 'camera-1'})).toBe(3);
    expect(JSON.parse(extension.frameSyncSummary({CAMERA: 'camera-1'}))).toMatchObject({
      schema: frameSyncReportSchema,
      cameraId: 'camera-1',
      referencePeer: 'host',
      latencyMs: {count: 3, median: 44}
    });

    extension.sendFrameSyncReport({CAMERA: 'camera-1', PEER: 'fusion'});
    expect(transport.sendEvent).toHaveBeenCalledWith(
      'fusion',
      frameSyncReportSchema,
      expect.stringContaining('"cameraId":"camera-1"'),
      syncChannel
    );

    extension.clearFrameSyncSamples({CAMERA: 'camera-1'});
    expect(extension.frameSyncSampleCount({CAMERA: 'camera-1'})).toBe(0);
    expect(extension.frameSyncSummary({CAMERA: 'camera-1'})).toBe('');
  });

  it('keeps sync traffic out of the receive queue and aggregates reports', () => {
    const session = new FakeSession();
    const transport = {sendEvent: vi.fn()};
    const extension = new WebRtcManualPairingExtension(
      session,
      new SyncService(transport, {nowUs: () => 3_000_000})
    );

    expect(
      session.deliverInternal({
        channel: syncChannel,
        type: clockProbeSchema,
        payload: createClockPing(1, 1_000_000)
      })
    ).toBe(true);
    expect(transport.sendEvent).toHaveBeenCalledWith(
      'peer-a',
      clockProbeSchema,
      expect.stringContaining('"kind":"pong"'),
      syncChannel
    );
    expect(session.deliverInternal({channel: 'default', type: 'door-open'})).toBe(false);

    for (const [cameraId, median] of [
      ['camera-1', 40],
      ['camera-2', 60]
    ] as const) {
      session.deliverInternal({
        peer: `peer-${cameraId}`,
        channel: syncChannel,
        type: frameSyncReportSchema,
        payload: {
          schema: frameSyncReportSchema,
          version: frameSyncReportVersion,
          cameraId,
          referencePeer: 'host',
          measuredAtUs: 1_000,
          latencyMs: {
            count: 4,
            min: median - 2,
            p10: median - 2,
            median,
            p90: median + 2,
            max: median + 2,
            mean: median,
            mad: 1,
            stddev: 1
          },
          clock: null
        }
      });
    }

    expect(JSON.parse(extension.frameSyncCameras())).toEqual(['camera-1', 'camera-2']);
    expect(extension.frameSyncLatencyOfCamera({CAMERA: 'camera-1'})).toBe(40);
    expect(extension.frameSyncOffsetOfCamera({CAMERA: 'camera-1'})).toBe(-10);
    expect(extension.frameSyncOffsetOfCamera({CAMERA: 'camera-2'})).toBe(10);
    expect(JSON.parse(extension.frameSyncReport())).toMatchObject({referenceLatencyMs: 50});

    extension.clearFrameSyncReport();
    expect(JSON.parse(extension.frameSyncReport())).toEqual({
      referenceLatencyMs: 0,
      cameras: []
    });
  });
});
