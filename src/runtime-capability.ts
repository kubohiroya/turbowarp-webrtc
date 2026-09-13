import type {
  LatestDataChannelStats,
  LatestDataSendResult,
  PeerSessionPort
} from './manual-peer-session.js';

export const runtimeCapabilityVersion = 2 as const;
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
  readonly version: typeof runtimeCapabilityVersion;
  requireVersion(version: number): WebRtcRuntimeCapabilityV2;
  createOffer(peer: string): Promise<string>;
  getOffer(peer: string): string;
}

export function createRuntimeCapability(session: PeerSessionPort): WebRtcRuntimeCapabilityV2 {
  const capability: WebRtcRuntimeCapabilityV2 = {
    version: runtimeCapabilityVersion,
    requireVersion(version) {
      if (version !== 1 && version !== runtimeCapabilityVersion) {
        throw new Error(
          `Unsupported WebRTC runtime capability version: ${version}; supported versions are 1 and ${runtimeCapabilityVersion}.`
        );
      }
      return capability;
    },
    createOffer: (peer) => session.createOffer(peer),
    getOffer: (peer) => session.getOffer(peer),
    setLatestDataEnabled: (enabled) => session.setLatestDataEnabled(enabled),
    configureLatestDataChannel: (peer, channel, highWaterMark) =>
      session.configureLatestDataChannel(peer, channel, highWaterMark),
    sendLatestData: (peer, channel, payloadText) =>
      session.sendLatestData(peer, channel, payloadText),
    latestDataStats: (peer, channel) => session.latestDataStats(peer, channel)
  };
  return Object.freeze(capability);
}
