import {describe, expect, it} from 'vitest';
import {SyncService, type SyncTransport} from '../src/sync-service.js';
import {protocolVersion, type ReceivedEnvelope} from '../src/protocol.js';
import {frameSyncReportSchema, syncChannel} from '../src/sync-protocol.js';

interface SentEvent {
  peer: string;
  type: string;
  channel: string;
  payload: unknown;
}

/** Delivers everything the local service sends straight into the remote service. */
class TestLink implements SyncTransport {
  public readonly sent: SentEvent[] = [];
  public target: SyncService | undefined;
  private readonly knownAs: string;

  public constructor(knownAs: string) {
    this.knownAs = knownAs;
  }

  public sendEvent(peer: string, type: string, payloadText: string, channel: string): void {
    const payload: unknown = JSON.parse(payloadText);
    this.sent.push({peer, type, channel, payload});
    this.target?.handleEnvelope(envelope(this.knownAs, type, channel, payload));
  }
}

function envelope(
  peer: string,
  type: string,
  channel: string,
  payload: unknown
): ReceivedEnvelope {
  return {
    version: protocolVersion,
    id: `${peer}-${type}`,
    seq: 1,
    from: peer,
    peer,
    channel,
    type,
    payload,
    timestamp: 0
  };
}

function immediateWait(): Promise<void> {
  return Promise.resolve();
}

function createPair(options: {cameraNowUs?: () => number; fusionNowUs?: () => number} = {}): {
  camera: SyncService;
  fusion: SyncService;
  cameraLink: TestLink;
  fusionLink: TestLink;
} {
  const cameraLink = new TestLink('camera-pc');
  const fusionLink = new TestLink('fusion-pc');
  const camera = new SyncService(cameraLink, {
    nowUs: options.cameraNowUs ?? (() => 1_000_000),
    wait: immediateWait,
    exchanges: 4,
    intervalMs: 0
  });
  const fusion = new SyncService(fusionLink, {
    nowUs: options.fusionNowUs ?? (() => 1_000_000),
    wait: immediateWait,
    exchanges: 4,
    intervalMs: 0
  });
  cameraLink.target = fusion;
  fusionLink.target = camera;
  return {camera, fusion, cameraLink, fusionLink};
}

describe('SyncService', () => {
  it('probes a peer clock over the internal sync channel', async () => {
    const {camera, cameraLink} = createPair({
      cameraNowUs: () => 1_000_000,
      fusionNowUs: () => 1_100_000
    });

    const estimate = await camera.syncClock('fusion-pc');

    expect(estimate.offsetUs).toBeCloseTo(100_000, 6);
    expect(camera.clockOffsetUs('fusion-pc')).toBeCloseTo(100_000, 6);
    expect(camera.clockRoundTripUs('fusion-pc')).toBe(0);
    expect(camera.peerTimeUs('fusion-pc')).toBeCloseTo(1_100_000, 6);
    expect(camera.localTimeUs()).toBe(1_000_000);
    expect(cameraLink.sent.every((event) => event.channel === syncChannel)).toBe(true);
  });

  it('expresses a captured frame in the peer clock before measuring latency', async () => {
    const {camera} = createPair({
      cameraNowUs: () => 1_000_000,
      fusionNowUs: () => 1_100_000
    });
    await camera.syncClock('fusion-pc');

    // The capture happened 100 ms before the peer clock reading it maps onto.
    expect(camera.frameLatency(1_000_000, 1_100_000, 0, 'fusion-pc')).toBeCloseTo(0, 6);
    expect(camera.frameLatency(1_000_000, 1_050_000, 0, 'fusion-pc')).toBeCloseTo(50_000, 6);
  });

  it('summarizes local samples and delivers them to the aggregating peer', async () => {
    const {camera, fusion, cameraLink} = createPair();
    await camera.syncClock('fusion-pc');

    for (const latencyMs of [40, 44, 48, 52, 56]) {
      camera.recordSample('camera-1', 1_000_000 + latencyMs * 1000, 1_000_000, 0, 'fusion-pc');
    }

    expect(camera.sampleCount('camera-1')).toBe(5);
    expect(camera.localReport('camera-1')).toMatchObject({
      cameraId: 'camera-1',
      referencePeer: 'fusion-pc',
      latencyUs: {count: 5, median: 48_000, min: 40_000, max: 56_000}
    });

    camera.sendReport('camera-1', 'fusion-pc');

    const report = cameraLink.sent[cameraLink.sent.length - 1];
    expect(report).toMatchObject({peer: 'fusion-pc', type: frameSyncReportSchema, channel: syncChannel});
    expect(JSON.parse(fusion.reportCameras())).toEqual(['camera-1']);
    expect(fusion.reportLatencyUs('camera-1')).toBe(48_000);
    expect(fusion.reportOffsetUs('camera-1')).toBe(0);
    expect(JSON.parse(fusion.reportOverview())).toMatchObject({
      referenceLatencyUs: 48_000,
      cameras: [{cameraId: 'camera-1', peer: 'camera-pc', offsetUs: 0}]
    });

    fusion.clearReport();
    expect(JSON.parse(fusion.reportCameras())).toEqual([]);

    camera.clearSamples('camera-1');
    expect(camera.sampleCount('camera-1')).toBe(0);
  });

  it('refuses to report a camera that has no samples', () => {
    const {camera} = createPair();
    expect(() => camera.sendReport('camera-1', 'fusion-pc')).toThrow('no frame sync samples');
  });

  it('consumes only sync channel traffic', () => {
    const {fusion} = createPair();

    expect(fusion.handleEnvelope(envelope('camera-pc', 'door-open', 'default', {}))).toBe(false);
    expect(fusion.handleEnvelope(envelope('camera-pc', 'unknown', syncChannel, {}))).toBe(true);
    expect(fusion.handleEnvelope(envelope('camera-pc', frameSyncReportSchema, syncChannel, {}))).toBe(
      true
    );
    expect(JSON.parse(fusion.reportCameras())).toEqual([]);
  });
});
