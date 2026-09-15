/**
 * Wire contracts shared by the clock probe and the frame sync report.
 *
 * The clock probe payload mirrors the `twmp/clock-probe` version 1 contract
 * defined by the turbowarp-realtime-motion-capture-app protocol: integer microsecond
 * timestamps, a monotonically increasing sequence number, and no extra
 * properties. Frame sync reports use the same style so that they can be
 * promoted to a versioned schema without changing the runtime code.
 */

/**
 * Internal channel used for sync traffic so it never reaches the receive queue.
 *
 * The name is namespaced because everything the transport consumes on it is
 * invisible to the project: a plain name like `sync` would silently swallow
 * application messages that happened to pick the same channel.
 */
export const syncChannel = 'twmp/sync';

export const clockProbeSchema = 'twmp/clock-probe';
export const clockProbeVersion = 1;
export const frameSyncReportSchema = 'twmp/frame-sync-report';
export const frameSyncReportVersion = 1;

export interface ClockPing {
  schema: typeof clockProbeSchema;
  version: typeof clockProbeVersion;
  kind: 'ping';
  sequence: number;
  t0Us: number;
}

export interface ClockPong {
  schema: typeof clockProbeSchema;
  version: typeof clockProbeVersion;
  kind: 'pong';
  sequence: number;
  t0Us: number;
  t1Us: number;
  t2Us: number;
}

export type ClockProbe = ClockPing | ClockPong;

/** Latency order statistics. Every field is in microseconds. */
export interface LatencyStats {
  count: number;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  mean: number;
  mad: number;
  stddev: number;
}

export interface ClockQuality {
  offsetUs: number;
  rttUs: number;
  uncertaintyUs: number;
  samples: number;
}

export interface FrameSyncReport {
  schema: typeof frameSyncReportSchema;
  version: typeof frameSyncReportVersion;
  cameraId: string;
  referencePeer: string;
  measuredAtUs: number;
  latencyUs: LatencyStats;
  clock: ClockQuality | null;
}

export function createClockPing(sequence: number, t0Us: number): ClockPing {
  return {
    schema: clockProbeSchema,
    version: clockProbeVersion,
    kind: 'ping',
    sequence: toSafeInteger(sequence),
    t0Us: toSafeInteger(t0Us)
  };
}

export function createClockPong(ping: ClockPing, t1Us: number, t2Us: number): ClockPong {
  return {
    schema: clockProbeSchema,
    version: clockProbeVersion,
    kind: 'pong',
    sequence: ping.sequence,
    t0Us: ping.t0Us,
    t1Us: toSafeInteger(t1Us),
    t2Us: toSafeInteger(t2Us)
  };
}

export function parseClockProbe(value: unknown): ClockProbe | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (record.schema !== clockProbeSchema || record.version !== clockProbeVersion) return undefined;
  const sequence = asSafeInteger(record.sequence);
  const t0Us = asSafeInteger(record.t0Us);
  if (sequence === undefined || t0Us === undefined) return undefined;
  if (record.kind === 'ping') {
    return {schema: clockProbeSchema, version: clockProbeVersion, kind: 'ping', sequence, t0Us};
  }
  if (record.kind !== 'pong') return undefined;
  const t1Us = asSafeInteger(record.t1Us);
  const t2Us = asSafeInteger(record.t2Us);
  if (t1Us === undefined || t2Us === undefined) return undefined;
  return {
    schema: clockProbeSchema,
    version: clockProbeVersion,
    kind: 'pong',
    sequence,
    t0Us,
    t1Us,
    t2Us
  };
}

export function parseFrameSyncReport(value: unknown): FrameSyncReport | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (record.schema !== frameSyncReportSchema) return undefined;
  if (record.version !== frameSyncReportVersion) return undefined;
  const cameraId = asNonEmptyString(record.cameraId);
  const measuredAtUs = asSafeInteger(record.measuredAtUs);
  const latencyUs = asLatencyStats(record.latencyUs);
  if (cameraId === undefined || measuredAtUs === undefined || !latencyUs) return undefined;
  return {
    schema: frameSyncReportSchema,
    version: frameSyncReportVersion,
    cameraId,
    referencePeer: asNonEmptyString(record.referencePeer) ?? '',
    measuredAtUs,
    latencyUs,
    clock: asClockQuality(record.clock)
  };
}

/** Current local time in microseconds, using the highest resolution clock available. */
export function nowMicroseconds(): number {
  if (typeof performance === 'object' && typeof performance.now === 'function') {
    return Math.round((performance.timeOrigin + performance.now()) * 1000);
  }
  return Date.now() * 1000;
}

function asLatencyStats(value: unknown): LatencyStats | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const count = asSafeInteger(record.count);
  if (count === undefined) return undefined;
  const numbers: Record<string, number> = {};
  for (const key of ['min', 'p10', 'median', 'p90', 'max', 'mean', 'mad', 'stddev']) {
    const parsed = asFiniteNumber(record[key]);
    if (parsed === undefined) return undefined;
    numbers[key] = parsed;
  }
  return {
    count,
    min: numbers.min ?? 0,
    p10: numbers.p10 ?? 0,
    median: numbers.median ?? 0,
    p90: numbers.p90 ?? 0,
    max: numbers.max ?? 0,
    mean: numbers.mean ?? 0,
    mad: numbers.mad ?? 0,
    stddev: numbers.stddev ?? 0
  };
}

function asClockQuality(value: unknown): ClockQuality | null {
  const record = asRecord(value);
  if (!record) return null;
  const offsetUs = asFiniteNumber(record.offsetUs);
  const rttUs = asFiniteNumber(record.rttUs);
  const uncertaintyUs = asFiniteNumber(record.uncertaintyUs);
  const samples = asSafeInteger(record.samples);
  if (offsetUs === undefined || rttUs === undefined) return null;
  if (uncertaintyUs === undefined || samples === undefined) return null;
  return {offsetUs, rttUs, uncertaintyUs, samples};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function toSafeInteger(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    throw new RangeError('Clock probe timestamps must be non-negative safe integers.');
  }
  return rounded;
}
