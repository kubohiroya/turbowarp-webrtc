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
export type LatestDataSendResult = 'sent' | 'dropped' | 'unavailable';

export interface LatestDataChannelStats {
  state: RTCDataChannelState | 'disabled' | 'not-configured';
  bufferedAmount: number;
  sentCount: number;
  droppedCount: number;
  highWaterMark: number;
  dropPolicy: 'drop-newest';
}

/** Consumes transport-internal traffic. Returning true keeps it out of the receive queue. */
export type InternalMessageHandler = (message: ReceivedEnvelope) => boolean;

export interface ManualPeerSessionOptions {
  localId?: string;
  queueLimit?: number;
  latestDataEnabled?: boolean;
  peerConnectionFactory?: (configuration: RTCConfiguration) => RTCPeerConnection;
}

export interface PeerSessionPort {
  setIceMode(mode: string): IceMode;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
  acceptOffer(peer: string, code: string): Promise<string>;
  getAnswer(peer: string): string;
  acceptAnswer(peer: string, code: string): Promise<void>;
  sendEvent(peer: string, type: string, payloadText: string, channel: string): void;
  setLatestDataEnabled(enabled: boolean): void;
  configureLatestDataChannel(peer: string, channel: string, highWaterMark: number): void;
  sendLatestData(peer: string, channel: string, payloadText: string): LatestDataSendResult;
  latestDataStats(peer: string, channel: string): LatestDataChannelStats;
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
  closeAll(): void;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  controlChannel?: RTCDataChannel;
  latestChannels: Map<string, LatestDataChannelRecord>;
  offerCode?: string;
  answerCode?: string;
}

interface LatestDataChannelRecord {
  channel: RTCDataChannel;
  highWaterMark: number;
  sentCount: number;
  droppedCount: number;
}

const channelLabel = 'tm-events';
const latestDataChannelLabelPrefix = 'tm-latest:';
const defaultQueueLimit = 200;
export const defaultLatestDataHighWaterMark = 256 * 1024;

export class ManualPeerSession implements PeerSessionPort {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly queueLimit: number;
  private readonly localId: string;
  private readonly peerConnectionFactory: (configuration: RTCConfiguration) => RTCPeerConnection;
  private iceMode: IceMode = 'lan';
  private latestDataEnabled: boolean;
  private readonly latestDataConfigurations = new Map<string, Map<string, number>>();
  private receiveQueue: ReceivedEnvelope[] = [];
  private latestMessage: ReceivedEnvelope | undefined;
  private messageHandler: MessageHandler | undefined;
  private internalHandler: InternalMessageHandler | undefined;
  private seq = 0;

  public constructor(options: ManualPeerSessionOptions = {}) {
    this.localId = options.localId ?? randomId();
    this.queueLimit = options.queueLimit ?? defaultQueueLimit;
    this.latestDataEnabled = options.latestDataEnabled ?? false;
    this.peerConnectionFactory =
      options.peerConnectionFactory ?? ((configuration) => new RTCPeerConnection(configuration));
  }

  public setIceMode(mode: string): IceMode {
    const normalized = mode.trim().toLowerCase();
    this.iceMode = normalized === 'stun' ? 'stun' : 'lan';
    return this.iceMode;
  }

  public async createOffer(peer: string): Promise<string> {
    const record = this.createPeer(peer);
    const channel = record.connection.createDataChannel(channelLabel, {
      ordered: true
    });
    this.attachControlChannel(peer, record, channel);
    if (this.latestDataEnabled) {
      for (const [name, highWaterMark] of this.configurationsFor(peer)) {
        const latestChannel = record.connection.createDataChannel(this.latestDataLabel(name), {
          ordered: false,
          maxRetransmits: 0
        });
        this.attachLatestDataChannel(peer, record, name, latestChannel, highWaterMark);
      }
    }
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

  public setLatestDataEnabled(enabled: boolean): void {
    this.latestDataEnabled = enabled;
    if (!enabled) {
      for (const record of this.peers.values()) {
        for (const latest of record.latestChannels.values()) latest.channel.close();
        record.latestChannels.clear();
      }
    }
  }

  public configureLatestDataChannel(peer: string, channel: string, highWaterMark: number): void {
    const peerName = normalizeName(peer, 'peer');
    const channelName = normalizeName(channel, 'pose');
    const limit = normalizeHighWaterMark(highWaterMark);
    let configurations = this.latestDataConfigurations.get(peerName);
    if (!configurations) {
      configurations = new Map();
      this.latestDataConfigurations.set(peerName, configurations);
    }
    configurations.set(channelName, limit);
  }

  public sendLatestData(peer: string, channel: string, payloadText: string): LatestDataSendResult {
    if (!this.latestDataEnabled) return 'unavailable';
    const peerName = normalizeName(peer, 'peer');
    const channelName = normalizeName(channel, 'pose');
    const latest = this.peers.get(peerName)?.latestChannels.get(channelName);
    if (!latest || latest.channel.readyState !== 'open') return 'unavailable';
    if (latest.channel.bufferedAmount > latest.highWaterMark) {
      latest.droppedCount += 1;
      return 'dropped';
    }
    latest.channel.send(
      serializeEnvelope(this.createEnvelope('latest-data', payloadText, channelName))
    );
    latest.sentCount += 1;
    return 'sent';
  }

  public latestDataStats(peer: string, channel: string): LatestDataChannelStats {
    if (!this.latestDataEnabled) return emptyLatestDataStats('disabled', 0);
    const peerName = normalizeName(peer, 'peer');
    const channelName = normalizeName(channel, 'pose');
    const configured = this.latestDataConfigurations.get(peerName)?.get(channelName);
    const latest = this.peers.get(peerName)?.latestChannels.get(channelName);
    if (!latest) return emptyLatestDataStats('not-configured', configured ?? 0);
    return {
      state: latest.channel.readyState,
      bufferedAmount: latest.channel.bufferedAmount,
      sentCount: latest.sentCount,
      droppedCount: latest.droppedCount,
      highWaterMark: latest.highWaterMark,
      dropPolicy: 'drop-newest'
    };
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
      .filter(
        ([, record]) =>
          record.connection.connectionState === 'connected' &&
          record.controlChannel?.readyState === 'open'
      )
      .map(([peer]) => peer);
  }

  public closePeer(peer: string): void {
    const key = peer.trim();
    const record = this.peers.get(key);
    if (!record) return;
    record.controlChannel?.close();
    for (const latest of record.latestChannels.values()) latest.channel.close();
    record.connection.close();
    this.peers.delete(key);
  }

  public closeAll(): void {
    for (const peer of [...this.peers.keys()]) this.closePeer(peer);
    this.latestDataConfigurations.clear();
    this.setMessageHandler(undefined);
    this.setInternalHandler(undefined);
  }

  private createPeer(peer: string): PeerRecord {
    const key = peer.trim();
    this.closePeer(key);
    const connection = this.peerConnectionFactory(this.configuration());
    const record: PeerRecord = {connection, latestChannels: new Map()};
    connection.ondatachannel = (event) => this.acceptIncomingChannel(key, record, event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        record.controlChannel?.close();
        for (const latest of record.latestChannels.values()) latest.channel.close();
        delete record.controlChannel;
        record.latestChannels.clear();
      }
    };
    this.peers.set(key, record);
    return record;
  }

  private attachControlChannel(peer: string, record: PeerRecord, channel: RTCDataChannel): void {
    record.controlChannel = channel;
    this.attachMessageHandler(peer, channel);
  }

  private acceptIncomingChannel(peer: string, record: PeerRecord, channel: RTCDataChannel): void {
    if (channel.label === channelLabel) {
      this.attachControlChannel(peer, record, channel);
      return;
    }
    const name = this.latestDataName(channel.label);
    if (!name || !this.latestDataEnabled) {
      channel.close();
      return;
    }
    const highWaterMark =
      this.latestDataConfigurations.get(peer)?.get(name) ?? defaultLatestDataHighWaterMark;
    this.attachLatestDataChannel(peer, record, name, channel, highWaterMark);
  }

  private attachLatestDataChannel(
    peer: string,
    record: PeerRecord,
    name: string,
    channel: RTCDataChannel,
    highWaterMark: number
  ): void {
    record.latestChannels.get(name)?.channel.close();
    record.latestChannels.set(name, {
      channel,
      highWaterMark,
      sentCount: 0,
      droppedCount: 0
    });
    this.attachMessageHandler(peer, channel);
  }

  private attachMessageHandler(peer: string, channel: RTCDataChannel): void {
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
    if (!record.controlChannel || record.controlChannel.readyState !== 'open') {
      throw new Error(`Peer ${peer} is not ready for sending.`);
    }
    record.controlChannel.send(serializeEnvelope(envelope));
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
    if (!this.internalHandler) return false;
    try {
      return this.internalHandler(message) === true;
    } catch {
      // A handler only throws once it is already handling transport traffic, so
      // the message is still consumed. Falling through would push internal
      // traffic into the receive queue and start application hat blocks.
      return true;
    }
  }

  private makePairingCode(
    kind: PairingCode['kind'],
    description: RTCSessionDescription | null
  ): string {
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

  private configurationsFor(peer: string): ReadonlyMap<string, number> {
    return this.latestDataConfigurations.get(normalizeName(peer, 'peer')) ?? new Map();
  }

  private latestDataLabel(name: string): string {
    return `${latestDataChannelLabelPrefix}${encodeURIComponent(name)}`;
  }

  private latestDataName(label: string): string | undefined {
    if (!label.startsWith(latestDataChannelLabelPrefix)) return undefined;
    try {
      return normalizeName(
        decodeURIComponent(label.slice(latestDataChannelLabelPrefix.length)),
        'pose'
      );
    } catch {
      return undefined;
    }
  }
}

function normalizeName(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function normalizeHighWaterMark(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : defaultLatestDataHighWaterMark;
}

function emptyLatestDataStats(
  state: LatestDataChannelStats['state'],
  highWaterMark: number
): LatestDataChannelStats {
  return {
    state,
    bufferedAmount: 0,
    sentCount: 0,
    droppedCount: 0,
    highWaterMark,
    dropPolicy: 'drop-newest'
  };
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
