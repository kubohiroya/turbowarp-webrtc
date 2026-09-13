import {
  frameSyncReportSchema,
  frameSyncReportVersion,
  type ClockQuality,
  type FrameSyncReport,
  type LatencyStats
} from './sync-protocol.js';

export interface FrameSyncEntry {
  cameraId: string;
  peer: string;
  referencePeer: string;
  latencyMs: LatencyStats;
  offsetMs: number;
  clock: ClockQuality | null;
  measuredAtUs: number;
  receivedAtUs: number;
}

export interface FrameSyncOverview {
  referenceLatencyMs: number;
  cameras: FrameSyncEntry[];
}

const defaultSampleLimit = 20000;

/**
 * Converts one decoded pattern observation into a capture latency.
 *
 * `captureMs` must already be expressed in the clock that produced `patternMs`.
 * A positive `wrapMs` unwraps a pattern whose encoded time repeats, which keeps
 * the result correct as long as the true latency stays below the wrap period.
 */
export function frameLatencyMs(captureMs: number, patternMs: number, wrapMs = 0): number {
  const latency = captureMs - patternMs;
  if (!(wrapMs > 0)) return latency;
  return ((latency % wrapMs) + wrapMs) % wrapMs;
}

export function summarizeLatencies(values: readonly number[]): LatencyStats | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return undefined;
  const sorted = [...finite].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  const variance =
    sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    p10: percentile(sorted, 0.1),
    median,
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
    mean,
    mad: percentile(deviations, 0.5),
    stddev: Math.sqrt(variance)
  };
}

export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

/** Latency samples collected locally, grouped by camera slot. */
export class LatencySampleStore {
  private readonly samples = new Map<string, number[]>();
  private readonly limit: number;

  public constructor(limit = defaultSampleLimit) {
    this.limit = Math.max(1, limit);
  }

  public add(cameraId: string, latencyMs: number): void {
    if (!Number.isFinite(latencyMs)) return;
    const bucket = this.samples.get(cameraId) ?? [];
    bucket.push(latencyMs);
    while (bucket.length > this.limit) bucket.shift();
    this.samples.set(cameraId, bucket);
  }

  public count(cameraId: string): number {
    return this.samples.get(cameraId)?.length ?? 0;
  }

  public values(cameraId: string): readonly number[] {
    return this.samples.get(cameraId) ?? [];
  }

  public summarize(cameraId: string): LatencyStats | undefined {
    return summarizeLatencies(this.values(cameraId));
  }

  public clear(cameraId: string): void {
    this.samples.delete(cameraId);
  }

  public clearAll(): void {
    this.samples.clear();
  }

  public cameras(): string[] {
    return [...this.samples.keys()].sort();
  }
}

export function createFrameSyncReport(options: {
  cameraId: string;
  referencePeer: string;
  measuredAtUs: number;
  latencyMs: LatencyStats;
  clock: ClockQuality | null;
}): FrameSyncReport {
  return {
    schema: frameSyncReportSchema,
    version: frameSyncReportVersion,
    cameraId: options.cameraId,
    referencePeer: options.referencePeer,
    measuredAtUs: options.measuredAtUs,
    latencyMs: options.latencyMs,
    clock: options.clock
  };
}

/**
 * Collected reports from every camera slot.
 *
 * The reference latency is the median of the per-camera median latencies, so a
 * camera's offset says how much later that camera finishes recording a frame
 * than the group as a whole. Subtracting the offset from a camera's frame
 * timestamps aligns its frames with the other cameras.
 */
export class FrameSyncRegistry {
  private readonly entries = new Map<string, FrameSyncEntry>();

  public accept(report: FrameSyncReport, peer: string, receivedAtUs: number): FrameSyncEntry {
    const entry: FrameSyncEntry = {
      cameraId: report.cameraId,
      peer,
      referencePeer: report.referencePeer,
      latencyMs: report.latencyMs,
      offsetMs: 0,
      clock: report.clock,
      measuredAtUs: report.measuredAtUs,
      receivedAtUs
    };
    this.entries.set(report.cameraId, entry);
    return entry;
  }

  public cameras(): string[] {
    return [...this.entries.keys()].sort();
  }

  public has(cameraId: string): boolean {
    return this.entries.has(cameraId);
  }

  public referenceLatencyMs(): number {
    const medians = [...this.entries.values()]
      .map((entry) => entry.latencyMs.median)
      .sort((left, right) => left - right);
    return percentile(medians, 0.5);
  }

  public latencyMsOf(cameraId: string): number {
    return this.entries.get(cameraId)?.latencyMs.median ?? 0;
  }

  public offsetMsOf(cameraId: string): number {
    const entry = this.entries.get(cameraId);
    if (!entry) return 0;
    return entry.latencyMs.median - this.referenceLatencyMs();
  }

  public overview(): FrameSyncOverview {
    const referenceLatencyMs = this.referenceLatencyMs();
    return {
      referenceLatencyMs,
      cameras: this.cameras().map((cameraId) => {
        const entry = this.entries.get(cameraId) as FrameSyncEntry;
        return {...entry, offsetMs: entry.latencyMs.median - referenceLatencyMs};
      })
    };
  }

  public clear(): void {
    this.entries.clear();
  }
}
