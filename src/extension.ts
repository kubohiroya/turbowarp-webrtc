import {extensionConfig} from './config.js';
import definitions from './block-definitions.json';
import {ManualPeerSession, type PeerSessionPort} from './manual-peer-session.js';
import type {ReceivedEnvelope} from './protocol.js';
import {SyncService} from './sync-service.js';

type BlockTypeName = 'COMMAND' | 'REPORTER' | 'BOOLEAN' | 'EVENT';
type ArgumentTypeName = 'STRING' | 'NUMBER';

interface DefinitionArgument {
  type: ArgumentTypeName;
  defaultValue: string;
  menu?: string;
}

interface BlockDefinition {
  opcode: string;
  blockType: BlockTypeName;
  text: string;
  description: string;
  arguments: Record<string, DefinitionArgument>;
  isEdgeActivated?: boolean;
}

const blockDefinitions = definitions.blocks as readonly BlockDefinition[];
const networkMessageHatOpcode = `${extensionConfig.id}_whenReceiveNetworkMessage`;
const networkMessageThreadContextKey = '__turbowarpWebRtcNetworkMessage';

export class WebRtcManualPairingExtension implements TurboWarpExtension {
  private readonly session: PeerSessionPort;
  private readonly sync: SyncService;
  private latestNetworkMessage: ReceivedEnvelope | undefined;

  public constructor(session: PeerSessionPort = new ManualPeerSession(), sync?: SyncService) {
    this.session = session;
    this.sync = sync ?? new SyncService(session);
    this.session.setMessageHandler((message) => this.startNetworkMessageHats(message));
    this.session.setInternalHandler((message) => this.sync.handleEnvelope(message));
  }

  public getInfo(): Record<string, unknown> {
    return {
      id: extensionConfig.id,
      name: Scratch.translate(definitions.extensionName),
      blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
      menus: definitions.menus
    };
  }

  public setIceMode(args: {MODE: unknown}): void {
    this.session.setIceMode(Scratch.Cast.toString(args.MODE));
  }

  public async createOffer(args: {PEER: unknown}): Promise<void> {
    await this.session.createOffer(this.peer(args.PEER));
  }

  public getOffer(args: {PEER: unknown}): string {
    return this.session.getOffer(this.peer(args.PEER));
  }

  public async acceptOffer(args: {CODE: unknown; PEER: unknown}): Promise<void> {
    await this.session.acceptOffer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
  }

  public getAnswer(args: {PEER: unknown}): string {
    return this.session.getAnswer(this.peer(args.PEER));
  }

  public async acceptAnswer(args: {CODE: unknown; PEER: unknown}): Promise<void> {
    await this.session.acceptAnswer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
  }

  public sendEvent(args: {TYPE: unknown; PAYLOAD: unknown; CHANNEL: unknown; PEER: unknown}): void {
    this.session.sendEvent(
      Scratch.Cast.toString(args.PEER),
      Scratch.Cast.toString(args.TYPE),
      Scratch.Cast.toString(args.PAYLOAD),
      Scratch.Cast.toString(args.CHANNEL)
    );
  }

  public broadcastNetworkMessage(args: {
    MESSAGE: unknown;
    PAYLOAD: unknown;
    CHANNEL: unknown;
    PEER: unknown;
  }): void {
    this.session.sendEvent(
      Scratch.Cast.toString(args.PEER),
      Scratch.Cast.toString(args.MESSAGE),
      Scratch.Cast.toString(args.PAYLOAD),
      Scratch.Cast.toString(args.CHANNEL)
    );
  }

  public networkMessagePayload(_args?: Record<string, unknown>, util?: TurboWarpBlockUtility): string {
    const message = this.networkMessageFor(util);
    return message ? JSON.stringify(message.payload) : '';
  }

  public networkMessageSender(_args?: Record<string, unknown>, util?: TurboWarpBlockUtility): string {
    return this.networkMessageFor(util)?.from ?? '';
  }

  public networkMessagePeer(_args?: Record<string, unknown>, util?: TurboWarpBlockUtility): string {
    return this.networkMessageFor(util)?.peer ?? '';
  }

  public networkMessageChannel(_args?: Record<string, unknown>, util?: TurboWarpBlockUtility): string {
    return this.networkMessageFor(util)?.channel ?? '';
  }

  public hasMessages(): boolean {
    return this.session.hasMessages();
  }

  public messageCount(): number {
    return this.session.messageCount();
  }

  public nextMessage(): string {
    return this.session.nextMessage();
  }

  public lastMessage(): string {
    return this.session.lastMessage();
  }

  public clearMessages(): void {
    this.session.clearMessages();
  }

  public connectionState(args: {PEER: unknown}): string {
    return this.session.connectionState(this.peer(args.PEER));
  }

  public connectedPeers(): string {
    return JSON.stringify(this.session.connectedPeers());
  }

  public closePeer(args: {PEER: unknown}): void {
    this.session.closePeer(this.peer(args.PEER));
  }

  public async syncClock(args: {PEER: unknown}): Promise<void> {
    await this.sync.syncClock(this.peer(args.PEER));
  }

  public clockOffset(args: {PEER: unknown}): number {
    return this.sync.clockOffsetMs(this.peer(args.PEER));
  }

  public clockRoundTrip(args: {PEER: unknown}): number {
    return this.sync.clockRoundTripMs(this.peer(args.PEER));
  }

  public clockUncertainty(args: {PEER: unknown}): number {
    return this.sync.clockUncertaintyMs(this.peer(args.PEER));
  }

  public peerTime(args: {PEER: unknown}): number {
    return this.sync.peerTimeMs(this.peer(args.PEER));
  }

  public localTime(): number {
    return this.sync.localTimeMs();
  }

  public frameLatency(args: {
    CAPTURE: unknown;
    PATTERN: unknown;
    WRAP: unknown;
    PEER: unknown;
  }): number {
    return this.sync.frameLatency(
      Scratch.Cast.toNumber(args.CAPTURE),
      Scratch.Cast.toNumber(args.PATTERN),
      Scratch.Cast.toNumber(args.WRAP),
      this.peer(args.PEER)
    );
  }

  public recordFrameSyncSample(args: {
    CAMERA: unknown;
    CAPTURE: unknown;
    PATTERN: unknown;
    WRAP: unknown;
    PEER: unknown;
  }): void {
    this.sync.recordSample(
      this.camera(args.CAMERA),
      Scratch.Cast.toNumber(args.CAPTURE),
      Scratch.Cast.toNumber(args.PATTERN),
      Scratch.Cast.toNumber(args.WRAP),
      this.peer(args.PEER)
    );
  }

  public clearFrameSyncSamples(args: {CAMERA: unknown}): void {
    this.sync.clearSamples(this.camera(args.CAMERA));
  }

  public frameSyncSampleCount(args: {CAMERA: unknown}): number {
    return this.sync.sampleCount(this.camera(args.CAMERA));
  }

  public frameSyncSummary(args: {CAMERA: unknown}): string {
    const report = this.sync.localReport(this.camera(args.CAMERA));
    return report ? JSON.stringify(report) : '';
  }

  public sendFrameSyncReport(args: {CAMERA: unknown; PEER: unknown}): void {
    this.sync.sendReport(this.camera(args.CAMERA), this.peer(args.PEER));
  }

  public frameSyncReport(): string {
    return this.sync.reportOverview();
  }

  public frameSyncCameras(): string {
    return this.sync.reportCameras();
  }

  public frameSyncLatencyOfCamera(args: {CAMERA: unknown}): number {
    return this.sync.reportLatencyMs(this.camera(args.CAMERA));
  }

  public frameSyncOffsetOfCamera(args: {CAMERA: unknown}): number {
    return this.sync.reportOffsetMs(this.camera(args.CAMERA));
  }

  public clearFrameSyncReport(): void {
    this.sync.clearReport();
  }

  private peer(value: unknown): string {
    return Scratch.Cast.toString(value).trim() || 'peer';
  }

  private camera(value: unknown): string {
    return Scratch.Cast.toString(value).trim() || 'camera';
  }

  private startNetworkMessageHats(message: ReceivedEnvelope): void {
    this.latestNetworkMessage = message;
    this.attachNetworkMessageContext(
      Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, {MESSAGE: message.type}) ?? [],
      message
    );
    if (message.type !== '*') {
      this.attachNetworkMessageContext(
        Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, {MESSAGE: '*'}) ?? [],
        message
      );
    }
  }

  private attachNetworkMessageContext(threads: TurboWarpThread[], message: ReceivedEnvelope): void {
    for (const thread of threads) {
      thread[networkMessageThreadContextKey] = message;
    }
  }

  private networkMessageFor(util: TurboWarpBlockUtility | undefined): ReceivedEnvelope | undefined {
    const threadMessage = util?.thread?.[networkMessageThreadContextKey];
    return isReceivedEnvelope(threadMessage) ? threadMessage : this.latestNetworkMessage;
  }

  private toScratchBlock(block: BlockDefinition): Record<string, unknown> {
    return {
      opcode: block.opcode,
      blockType: Scratch.BlockType[block.blockType],
      text: Scratch.translate(block.text),
      ...(block.isEdgeActivated === undefined ? {} : {isEdgeActivated: block.isEdgeActivated}),
      arguments: Object.fromEntries(
        Object.entries(block.arguments).map(([name, argument]) => [
          name,
          {
            type: Scratch.ArgumentType[argument.type],
            defaultValue: argument.defaultValue,
            ...(argument.menu === undefined ? {} : {menu: argument.menu})
          }
        ])
      )
    };
  }
}

function isReceivedEnvelope(value: unknown): value is ReceivedEnvelope {
  return typeof value === 'object' && value !== null && 'type' in value && 'payload' in value;
}
