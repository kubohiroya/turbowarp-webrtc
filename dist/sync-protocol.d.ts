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
export declare const syncChannel = "twmp/sync";
export declare const clockProbeSchema = "twmp/clock-probe";
export declare const clockProbeVersion = 1;
export declare const frameSyncReportSchema = "twmp/frame-sync-report";
export declare const frameSyncReportVersion = 1;
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
export declare function createClockPing(sequence: number, t0Us: number): ClockPing;
export declare function createClockPong(ping: ClockPing, t1Us: number, t2Us: number): ClockPong;
export declare function parseClockProbe(value: unknown): ClockProbe | undefined;
export declare function parseFrameSyncReport(value: unknown): FrameSyncReport | undefined;
/** Current local time in microseconds, using the highest resolution clock available. */
export declare function nowMicroseconds(): number;
