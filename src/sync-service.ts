import {
  FrameSyncRegistry,
  LatencySampleStore,
  createFrameSyncReport,
  frameLatencyMs
} from './frame-sync.js';
import {ClockSync, type ClockEstimate, type ClockSyncOptions} from './sync-clock.js';
import {
  clockProbeSchema,
  frameSyncReportSchema,
  nowMicroseconds,
  parseFrameSyncReport,
  syncChannel,
  type FrameSyncReport
} from './sync-protocol.js';
import type {ReceivedEnvelope} from './protocol.js';

export interface SyncTransport {
  sendEvent(peer: string, type: string, payloadText: string, channel: string): void;
}

export interface SyncServiceOptions extends Omit<ClockSyncOptions, 'send'> {
  sampleLimit?: number;
}

/**
 * Clock probing and frame sync reporting on top of an existing peer transport.
 *
 * All sync traffic travels on a dedicated channel that the session keeps out of
 * the user-visible receive queue, so probing at a high rate never evicts
 * application messages.
 */
export class SyncService {
  private readonly transport: SyncTransport;
  private readonly clock: ClockSync;
  private readonly samples: LatencySampleStore;
  private readonly registry = new FrameSyncRegistry();
  private readonly referencePeers = new Map<string, string>();
  private readonly nowUs: () => number;

  public constructor(transport: SyncTransport, options: SyncServiceOptions = {}) {
    this.transport = transport;
    this.nowUs = options.nowUs ?? nowMicroseconds;
    this.samples = new LatencySampleStore(options.sampleLimit);
    this.clock = new ClockSync({
      ...options,
      nowUs: this.nowUs,
      send: (peer, type, payload) => this.send(peer, type, payload)
    });
  }

  /** Handles sync traffic. Returns true when the envelope was consumed. */
  public handleEnvelope(message: ReceivedEnvelope): boolean {
    if (message.channel !== syncChannel) return false;
    if (message.type === clockProbeSchema) {
      return this.clock.handleMessage(message.peer, message.type, message.payload);
    }
    if (message.type === frameSyncReportSchema) {
      const report = parseFrameSyncReport(message.payload);
      if (report) this.registry.accept(report, message.peer, this.nowUs());
      return true;
    }
    return true;
  }

  public async syncClock(peer: string): Promise<ClockEstimate> {
    return this.clock.syncWith(peer);
  }

  public clockOffsetMs(peer: string): number {
    return this.clock.offsetMsTo(peer);
  }

  public clockRoundTripMs(peer: string): number {
    return this.clock.rttMsTo(peer);
  }

  public clockUncertaintyMs(peer: string): number {
    return this.clock.uncertaintyMsTo(peer);
  }

  public localTimeMs(): number {
    return this.nowUs() / 1000;
  }

  public peerTimeMs(peer: string): number {
    return this.clock.toPeerTimeMs(peer, this.localTimeMs());
  }

  /**
   * Latency between the moment the pattern was shown and the moment this
   * computer finished recording the frame, expressed in the peer's clock.
   */
  public frameLatency(captureMs: number, patternMs: number, wrapMs: number, peer: string): number {
    return frameLatencyMs(this.clock.toPeerTimeMs(peer, captureMs), patternMs, wrapMs);
  }

  public recordSample(
    cameraId: string,
    captureMs: number,
    patternMs: number,
    wrapMs: number,
    peer: string
  ): number {
    const latency = this.frameLatency(captureMs, patternMs, wrapMs, peer);
    this.samples.add(cameraId, latency);
    this.referencePeers.set(cameraId, peer);
    return latency;
  }

  public clearSamples(cameraId: string): void {
    this.samples.clear(cameraId);
    this.referencePeers.delete(cameraId);
  }

  public sampleCount(cameraId: string): number {
    return this.samples.count(cameraId);
  }

  public localReport(cameraId: string): FrameSyncReport | undefined {
    const latencyMs = this.samples.summarize(cameraId);
    if (!latencyMs) return undefined;
    const referencePeer = this.referencePeers.get(cameraId) ?? '';
    return createFrameSyncReport({
      cameraId,
      referencePeer,
      measuredAtUs: this.nowUs(),
      latencyMs,
      clock: referencePeer ? this.clock.quality(referencePeer) : null
    });
  }

  public sendReport(cameraId: string, peer: string): FrameSyncReport {
    const report = this.localReport(cameraId);
    if (!report) {
      throw new Error(`Camera ${cameraId} has no frame sync samples to report.`);
    }
    this.send(peer, frameSyncReportSchema, report);
    return report;
  }

  public reportOverview(): string {
    return JSON.stringify(this.registry.overview());
  }

  public reportCameras(): string {
    return JSON.stringify(this.registry.cameras());
  }

  public reportLatencyMs(cameraId: string): number {
    return this.registry.latencyMsOf(cameraId);
  }

  public reportOffsetMs(cameraId: string): number {
    return this.registry.offsetMsOf(cameraId);
  }

  public clearReport(): void {
    this.registry.clear();
  }

  private send(peer: string, type: string, payload: unknown): void {
    this.transport.sendEvent(peer, type, JSON.stringify(payload), syncChannel);
  }
}
