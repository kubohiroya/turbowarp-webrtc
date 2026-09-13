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
  latencyUs: LatencyStats;
  offsetUs: number;
  clock: ClockQuality | null;
  measuredAtUs: number;
  receivedAtUs: number;
}

export interface FrameSyncOverview {
  referenceLatencyUs: number;
  cameras: FrameSyncEntry[];
}

const defaultSampleLimit = 20000;

/**
 * Converts one decoded pattern observation into a capture latency.
 *
 * `captureUs` must already be expressed in the clock that produced `patternUs`.
 * A positive `wrapUs` unwraps a pattern whose encoded time repeats, resolving it
 * to the half wrap period nearest zero rather than to the first positive
 * residue. Folding to a positive residue would turn a latency that is slightly
 * negative, which a clock offset error or an over-corrected frame age produces,
 * into an outlier just under a full wrap period and wreck the mean, the
 * percentiles and the spread of the summary. Keeping it negative leaves the
 * mistake visible. The result is correct while the true latency stays within
 * half the wrap period.
 */
export function frameLatencyUs(captureUs: number, patternUs: number, wrapUs = 0): number {
  const latency = captureUs - patternUs;
  if (!(wrapUs > 0)) return latency;
  const half = wrapUs / 2;
  return (((latency + half) % wrapUs) + wrapUs) % wrapUs - half;
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

  public add(cameraId: string, latencyUs: number): void {
    if (!Number.isFinite(latencyUs)) return;
    const bucket = this.samples.get(cameraId) ?? [];
    bucket.push(latencyUs);
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
  latencyUs: LatencyStats;
  clock: ClockQuality | null;
}): FrameSyncReport {
  return {
    schema: frameSyncReportSchema,
    version: frameSyncReportVersion,
    cameraId: options.cameraId,
    referencePeer: options.referencePeer,
    measuredAtUs: options.measuredAtUs,
    latencyUs: options.latencyUs,
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
      latencyUs: report.latencyUs,
      offsetUs: 0,
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

  public referenceLatencyUs(): number {
    const medians = [...this.entries.values()]
      .map((entry) => entry.latencyUs.median)
      .sort((left, right) => left - right);
    return percentile(medians, 0.5);
  }

  public latencyUsOf(cameraId: string): number {
    return this.entries.get(cameraId)?.latencyUs.median ?? 0;
  }

  public offsetUsOf(cameraId: string): number {
    const entry = this.entries.get(cameraId);
    if (!entry) return 0;
    return entry.latencyUs.median - this.referenceLatencyUs();
  }

  public overview(): FrameSyncOverview {
    const referenceLatencyUs = this.referenceLatencyUs();
    return {
      referenceLatencyUs,
      cameras: this.cameras().map((cameraId) => {
        const entry = this.entries.get(cameraId) as FrameSyncEntry;
        return {...entry, offsetUs: entry.latencyUs.median - referenceLatencyUs};
      })
    };
  }

  public clear(): void {
    this.entries.clear();
  }
}
