import type {
  LatestDataChannelStats,
  LatestDataSendResult,
  PeerSessionPort
} from './manual-peer-session.js';

export const runtimeCapabilityVersion = 1 as const;
export const runtimeCapabilityKey = 'kubohiroyaWebRtcCapability';

export interface WebRtcRuntimeCapabilityV1 {
  readonly version: typeof runtimeCapabilityVersion;
  requireVersion(version: number): WebRtcRuntimeCapabilityV1;
  setLatestDataEnabled(enabled: boolean): void;
  configureLatestDataChannel(peer: string, channel: string, highWaterMark: number): void;
  sendLatestData(peer: string, channel: string, payloadText: string): LatestDataSendResult;
  latestDataStats(peer: string, channel: string): LatestDataChannelStats;
}

export function createRuntimeCapability(session: PeerSessionPort): WebRtcRuntimeCapabilityV1 {
  const capability: WebRtcRuntimeCapabilityV1 = {
    version: runtimeCapabilityVersion,
    requireVersion(version) {
      if (version !== runtimeCapabilityVersion) {
        throw new Error(
          `Unsupported WebRTC runtime capability version: ${version}; expected ${runtimeCapabilityVersion}.`
        );
      }
      return capability;
    },
    setLatestDataEnabled: (enabled) => session.setLatestDataEnabled(enabled),
    configureLatestDataChannel: (peer, channel, highWaterMark) =>
      session.configureLatestDataChannel(peer, channel, highWaterMark),
    sendLatestData: (peer, channel, payloadText) =>
      session.sendLatestData(peer, channel, payloadText),
    latestDataStats: (peer, channel) => session.latestDataStats(peer, channel)
  };
  return Object.freeze(capability);
}
