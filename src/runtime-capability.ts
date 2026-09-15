import type {
  LatestDataChannelStats,
  LatestDataSendResult,
  PeerSessionPort
} from './manual-peer-session.js';

export const runtimeCapabilityVersion = 3 as const;
export const runtimeCapabilityKey = 'kubohiroyaWebRtcCapability';

export interface WebRtcRuntimeCapabilityV1 {
  readonly version: number;
  requireVersion(version: number): WebRtcRuntimeCapabilityV1;
  setLatestDataEnabled(enabled: boolean): void;
  configureLatestDataChannel(peer: string, channel: string, highWaterMark: number): void;
  sendLatestData(peer: string, channel: string, payloadText: string): LatestDataSendResult;
  latestDataStats(peer: string, channel: string): LatestDataChannelStats;
}

export interface WebRtcRuntimeCapabilityV2 extends WebRtcRuntimeCapabilityV1 {
  requireVersion(version: number): WebRtcRuntimeCapabilityV2;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
}

/**
 * Adds the answer side and the connection state, so another extension can drive
 * a whole offer/answer exchange instead of only producing an offer.
 */
export interface WebRtcRuntimeCapabilityV3 extends WebRtcRuntimeCapabilityV2 {
  readonly version: typeof runtimeCapabilityVersion;
  requireVersion(version: number): WebRtcRuntimeCapabilityV3;
  /** Accepts an offer and returns the answer pairing code. */
  acceptOffer(peer: string, code: string): Promise<string>;
  getAnswer(peer: string): string;
  acceptAnswer(peer: string, code: string): Promise<void>;
  /**
   * `RTCPeerConnection.connectionState` for this peer, or `'closed'` when no
   * connection exists. Use `hasPeer` to tell "never created" apart from
   * "closed", which matters when polling for an established connection.
   */
  connectionState(peer: string): string;
  hasPeer(peer: string): boolean;
  /**
   * Closes the peer connection. It belongs to whoever drives the pairing, so
   * call this only as an explicit action, never as incidental cleanup.
   */
  closePeer(peer: string): void;
}

const supportedVersions: readonly number[] = [1, 2, runtimeCapabilityVersion];

export function createRuntimeCapability(session: PeerSessionPort): WebRtcRuntimeCapabilityV3 {
  const capability: WebRtcRuntimeCapabilityV3 = {
    version: runtimeCapabilityVersion,
    requireVersion(version) {
      if (!supportedVersions.includes(version)) {
        throw new Error(
          `Unsupported WebRTC runtime capability version: ${version}; supported versions are ${supportedVersions.join(', ')}.`
        );
      }
      return capability;
    },
    createOffer: (peer) => session.createOffer(normalizePeer(peer)),
    getOffer: (peer) => session.getOffer(normalizePeer(peer)),
    acceptOffer: (peer, code) => session.acceptOffer(normalizePeer(peer), code),
    getAnswer: (peer) => session.getAnswer(normalizePeer(peer)),
    acceptAnswer: (peer, code) => session.acceptAnswer(normalizePeer(peer), code),
    connectionState: (peer) => session.connectionState(normalizePeer(peer)),
    hasPeer: (peer) => session.hasPeer(normalizePeer(peer)),
    closePeer: (peer) => session.closePeer(normalizePeer(peer)),
    setLatestDataEnabled: (enabled) => session.setLatestDataEnabled(enabled),
    configureLatestDataChannel: (peer, channel, highWaterMark) =>
      session.configureLatestDataChannel(normalizePeer(peer), channel, highWaterMark),
    sendLatestData: (peer, channel, payloadText) =>
      session.sendLatestData(normalizePeer(peer), channel, payloadText),
    latestDataStats: (peer, channel) => session.latestDataStats(normalizePeer(peer), channel)
  };
  return Object.freeze(capability);
}

/**
 * Matches the block layer's peer normalization, so a capability caller and a
 * block reach the same RTCPeerConnection for the same name.
 */
function normalizePeer(peer: string): string {
  return String(peer ?? '').trim() || 'peer';
}
