import {
  decodePairingCode,
  encodePairingCode,
  parseEnvelope,
  parsePayload,
  protocolVersion,
  serializeEnvelope,
  type EventEnvelope,
  type PairingCode,
  type ReceivedEnvelope
} from './protocol.js';

export type IceMode = 'lan' | 'stun';
export type MessageHandler = (message: ReceivedEnvelope) => void;

/** Consumes transport-internal traffic. Returning true keeps it out of the receive queue. */
export type InternalMessageHandler = (message: ReceivedEnvelope) => boolean;

export interface ManualPeerSessionOptions {
  localId?: string;
  queueLimit?: number;
}

export interface PeerSessionPort {
  setIceMode(mode: string): IceMode;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
  acceptOffer(peer: string, code: string): Promise<string>;
  getAnswer(peer: string): string;
  acceptAnswer(peer: string, code: string): Promise<void>;
  sendEvent(peer: string, type: string, payloadText: string, channel: string): void;
  setMessageHandler(handler: MessageHandler | undefined): void;
  setInternalHandler(handler: InternalMessageHandler | undefined): void;
  hasMessages(): boolean;
  messageCount(): number;
  nextMessage(): string;
  lastMessage(): string;
  clearMessages(): void;
  connectionState(peer: string): string;
  connectedPeers(): string[];
  closePeer(peer: string): void;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  channel?: RTCDataChannel;
  offerCode?: string;
  answerCode?: string;
}

const channelLabel = 'tm-events';
const defaultQueueLimit = 200;

export class ManualPeerSession implements PeerSessionPort {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly queueLimit: number;
  private readonly localId: string;
  private iceMode: IceMode = 'lan';
  private receiveQueue: ReceivedEnvelope[] = [];
  private latestMessage: ReceivedEnvelope | undefined;
  private messageHandler: MessageHandler | undefined;
  private internalHandler: InternalMessageHandler | undefined;
  private seq = 0;

  public constructor(options: ManualPeerSessionOptions = {}) {
    this.localId = options.localId ?? randomId();
    this.queueLimit = options.queueLimit ?? defaultQueueLimit;
  }

  public setIceMode(mode: string): IceMode {
    const normalized = mode.trim().toLowerCase();
    this.iceMode = normalized === 'stun' ? 'stun' : 'lan';
    return this.iceMode;
  }

  public async createOffer(peer: string): Promise<string> {
    const record = this.createPeer(peer);
    const channel = record.connection.createDataChannel(channelLabel, {ordered: true});
    this.attachChannel(peer, record, channel);
    const offer = await record.connection.createOffer();
    await record.connection.setLocalDescription(offer);
    await waitForIceGathering(record.connection);
    const code = this.makePairingCode('offer', record.connection.localDescription);
    record.offerCode = code;
    return code;
  }

  public getOffer(peer: string): string {
    return this.peers.get(peer)?.offerCode ?? '';
  }

  public async acceptOffer(peer: string, code: string): Promise<string> {
    const offer = decodePairingCode(code);
    if (offer.kind !== 'offer') {
      throw new Error('Expected an offer pairing code.');
    }
    const record = this.createPeer(peer);
    await record.connection.setRemoteDescription(offer.description);
    const answer = await record.connection.createAnswer();
    await record.connection.setLocalDescription(answer);
    await waitForIceGathering(record.connection);
    const answerCode = this.makePairingCode('answer', record.connection.localDescription);
    record.answerCode = answerCode;
    return answerCode;
  }

  public getAnswer(peer: string): string {
    return this.peers.get(peer)?.answerCode ?? '';
  }

  public async acceptAnswer(peer: string, code: string): Promise<void> {
    const answer = decodePairingCode(code);
    if (answer.kind !== 'answer') {
      throw new Error('Expected an answer pairing code.');
    }
    const record = this.requirePeer(peer);
    await record.connection.setRemoteDescription(answer.description);
  }

  public sendEvent(peer: string, type: string, payloadText: string, channel: string): void {
    const targets = peer.trim() === '*' ? this.connectedPeers() : [peer.trim()];
    for (const target of targets) {
      this.sendToPeer(target, this.createEnvelope(type, payloadText, channel));
    }
  }

  public setMessageHandler(handler: MessageHandler | undefined): void {
    this.messageHandler = handler;
  }

  public setInternalHandler(handler: InternalMessageHandler | undefined): void {
    this.internalHandler = handler;
  }

  public hasMessages(): boolean {
    return this.receiveQueue.length > 0;
  }

  public messageCount(): number {
    return this.receiveQueue.length;
  }

  public nextMessage(): string {
    const message = this.receiveQueue.shift();
    return message ? JSON.stringify(message) : '';
  }

  public lastMessage(): string {
    return this.latestMessage ? JSON.stringify(this.latestMessage) : '';
  }

  public clearMessages(): void {
    this.receiveQueue = [];
    this.latestMessage = undefined;
  }

  public connectionState(peer: string): string {
    return this.peers.get(peer.trim())?.connection.connectionState ?? 'closed';
  }

  public connectedPeers(): string[] {
    return [...this.peers.entries()]
      .filter(([, record]) => record.connection.connectionState === 'connected' && record.channel?.readyState === 'open')
      .map(([peer]) => peer);
  }

  public closePeer(peer: string): void {
    const key = peer.trim();
    const record = this.peers.get(key);
    if (!record) return;
    record.channel?.close();
    record.connection.close();
    this.peers.delete(key);
  }

  private createPeer(peer: string): PeerRecord {
    const key = peer.trim();
    this.closePeer(key);
    const connection = new RTCPeerConnection(this.configuration());
    const record: PeerRecord = {connection};
    connection.ondatachannel = (event) => this.attachChannel(key, record, event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        record.channel?.close();
      }
    };
    this.peers.set(key, record);
    return record;
  }

  private attachChannel(peer: string, record: PeerRecord, channel: RTCDataChannel): void {
    record.channel = channel;
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        this.pushMessage(parseEnvelope(peer, event.data));
      } catch {
        this.pushMessage({
          version: protocolVersion,
          id: randomId(),
          seq: 0,
          from: peer,
          peer,
          channel: 'raw',
          type: 'raw',
          payload: event.data,
          timestamp: Date.now()
        });
      }
    };
  }

  private sendToPeer(peer: string, envelope: EventEnvelope): void {
    const record = this.requirePeer(peer);
    if (!record.channel || record.channel.readyState !== 'open') {
      throw new Error(`Peer ${peer} is not ready for sending.`);
    }
    record.channel.send(serializeEnvelope(envelope));
  }

  private createEnvelope(type: string, payloadText: string, channel: string): EventEnvelope {
    return {
      version: protocolVersion,
      id: randomId(),
      seq: ++this.seq,
      from: this.localId,
      channel: channel.trim() || 'default',
      type: type.trim() || 'event',
      payload: parsePayload(payloadText),
      timestamp: Date.now()
    };
  }

  private pushMessage(message: ReceivedEnvelope): void {
    if (this.consumeInternally(message)) return;
    this.receiveQueue.push(message);
    while (this.receiveQueue.length > this.queueLimit) {
      this.receiveQueue.shift();
    }
    this.latestMessage = message;
    try {
      this.messageHandler?.(message);
    } catch {
      // Delivery hooks must not corrupt the transport queue.
    }
  }

  private consumeInternally(message: ReceivedEnvelope): boolean {
    try {
      return this.internalHandler?.(message) === true;
    } catch {
      // Transport-internal handlers must not stall message delivery.
      return false;
    }
  }

  private makePairingCode(kind: PairingCode['kind'], description: RTCSessionDescription | null): string {
    if (!description) {
      throw new Error('Local session description is not available.');
    }
    return encodePairingCode({
      version: protocolVersion,
      kind,
      description: description.toJSON()
    });
  }

  private requirePeer(peer: string): PeerRecord {
    const key = peer.trim();
    const record = this.peers.get(key);
    if (!record) {
      throw new Error(`Peer ${key} does not exist.`);
    }
    return record;
  }

  private configuration(): RTCConfiguration {
    if (this.iceMode === 'lan') {
      return {iceServers: []};
    }
    return {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
  }
}

function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      if (connection.iceGatheringState === 'complete') {
        connection.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    connection.addEventListener('icegatheringstatechange', done);
    setTimeout(done, 0);
  });
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
