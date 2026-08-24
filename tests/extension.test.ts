import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WebRtcManualPairingExtension} from '../src/extension.js';
import type {IceMode, MessageHandler} from '../src/manual-peer-session.js';
import {protocolVersion, type ReceivedEnvelope} from '../src/protocol.js';

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
    ArgumentType: {STRING: 'string'},
    Cast: {
      toString: (value: unknown) => String(value)
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
      'closePeer'
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
});
