import {extensionConfig} from './config.js';
import definitions from './block-definitions.json';
import {ManualPeerSession, type PeerSessionPort} from './manual-peer-session.js';
import type {ReceivedEnvelope} from './protocol.js';

type BlockTypeName = 'COMMAND' | 'REPORTER' | 'BOOLEAN' | 'EVENT';
type ArgumentTypeName = 'STRING';

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
  private latestNetworkMessage: ReceivedEnvelope | undefined;

  public constructor(session: PeerSessionPort = new ManualPeerSession()) {
    this.session = session;
    this.session.setMessageHandler((message) => this.startNetworkMessageHats(message));
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

  private peer(value: unknown): string {
    return Scratch.Cast.toString(value).trim() || 'peer';
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
