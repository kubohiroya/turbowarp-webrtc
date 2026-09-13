import {
  FrameSyncRegistry,
  LatencySampleStore,
  createFrameSyncReport,
  frameLatencyUs
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

  /**
   * Handles sync traffic. Returns true when the envelope was consumed.
   *
   * Only the two known payloads are claimed. Anything else, even on the
   * internal channel, is left for the application so that a stray envelope
   * surfaces in the receive queue instead of disappearing. Dispatch failures
   * are contained here: an envelope this service claimed must never fall
   * through and start application hat blocks.
   */
  public handleEnvelope(message: ReceivedEnvelope): boolean {
    if (message.channel !== syncChannel) return false;
    if (message.type !== clockProbeSchema && message.type !== frameSyncReportSchema) {
      return false;
    }
    try {
      if (message.type === clockProbeSchema) {
        this.clock.handleMessage(message.peer, message.type, message.payload);
      } else {
        const report = parseFrameSyncReport(message.payload);
        if (report) this.registry.accept(report, message.peer, this.nowUs());
      }
    } catch {
      // A peer that closed mid-probe must not push transport traffic into the
      // application's receive queue.
    }
    return true;
  }

  public async syncClock(peer: string): Promise<ClockEstimate> {
    return this.clock.syncWith(peer);
  }

  public clockOffsetUs(peer: string): number {
    return this.clock.offsetUsTo(peer);
  }

  public clockRoundTripUs(peer: string): number {
    return this.clock.rttUsTo(peer);
  }

  public clockUncertaintyUs(peer: string): number {
    return this.clock.uncertaintyUsTo(peer);
  }

  public localTimeUs(): number {
    return this.nowUs();
  }

  public peerTimeUs(peer: string): number {
    this.requireEstimate(peer);
    return this.clock.toPeerTimeUs(peer, this.localTimeUs());
  }

  /**
   * Latency between the moment the pattern was shown and the moment this
   * computer finished recording the frame, expressed in the peer's clock.
   */
  public frameLatency(captureUs: number, patternUs: number, wrapUs: number, peer: string): number {
    this.requireEstimate(peer);
    return frameLatencyUs(this.clock.toPeerTimeUs(peer, captureUs), patternUs, wrapUs);
  }

  public recordSample(
    cameraId: string,
    captureUs: number,
    patternUs: number,
    wrapUs: number,
    peer: string
  ): number {
    const latency = this.frameLatency(captureUs, patternUs, wrapUs, peer);
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
    const latencyUs = this.samples.summarize(cameraId);
    if (!latencyUs) return undefined;
    const referencePeer = this.referencePeers.get(cameraId) ?? '';
    return createFrameSyncReport({
      cameraId,
      referencePeer,
      measuredAtUs: this.nowUs(),
      latencyUs,
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

  public reportLatencyUs(cameraId: string): number {
    return this.registry.latencyUsOf(cameraId);
  }

  public reportOffsetUs(cameraId: string): number {
    return this.registry.offsetUsOf(cameraId);
  }

  public clearReport(): void {
    this.registry.clear();
  }

  /**
   * Refuses to express a local timestamp in a clock that was never probed.
   *
   * Without an estimate the offset would silently be zero, which compares two
   * unrelated wall clocks and, once folded into the pattern wrap period, yields
   * a plausible looking latency that is pure noise.
   */
  private requireEstimate(peer: string): void {
    if (!this.clock.hasEstimate(peer)) {
      throw new Error(`Sync the clock with peer ${peer} before measuring frame latency.`);
    }
  }

  private send(peer: string, type: string, payload: unknown): void {
    this.transport.sendEvent(peer, type, JSON.stringify(payload), syncChannel);
  }
}
