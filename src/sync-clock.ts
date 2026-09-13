import {
  clockProbeSchema,
  createClockPing,
  createClockPong,
  nowMicroseconds,
  parseClockProbe,
  type ClockPong,
  type ClockQuality
} from './sync-protocol.js';

export interface ClockEstimate extends ClockQuality {
  peer: string;
  updatedAtUs: number;
}

export type ClockSendFn = (peer: string, type: string, payload: unknown) => void;
export type WaitFn = (milliseconds: number) => Promise<void>;

export interface ClockSyncOptions {
  send: ClockSendFn;
  nowUs?: () => number;
  wait?: WaitFn;
  exchanges?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

interface Exchange {
  offsetUs: number;
  rttUs: number;
}

const defaultExchanges = 24;
const defaultIntervalMs = 20;
const defaultTimeoutMs = 1000;

/**
 * NTP-style clock offset estimation over an existing DataChannel.
 *
 * Every exchange records four timestamps: the request send time (t0), the remote
 * receive time (t1), the remote reply send time (t2) and the local reply arrival
 * time (t3). The offset that maps local time onto the remote clock is
 * ((t1 - t0) + (t2 - t3)) / 2 and the round trip is (t3 - t0) - (t2 - t1).
 * Exchanges with the shortest round trip carry the least queuing noise, so only
 * the fastest quarter of the exchanges is averaged.
 */
export class ClockSync {
  private readonly send: ClockSendFn;
  private readonly nowUs: () => number;
  private readonly wait: WaitFn;
  private readonly exchanges: number;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly estimates = new Map<string, ClockEstimate>();
  private readonly pending = new Map<string, (pong: ClockPong) => void>();
  private sequence = 0;

  public constructor(options: ClockSyncOptions) {
    this.send = options.send;
    this.nowUs = options.nowUs ?? nowMicroseconds;
    this.wait = options.wait ?? defaultWait;
    this.exchanges = Math.max(1, Math.trunc(options.exchanges ?? defaultExchanges));
    this.intervalMs = Math.max(0, options.intervalMs ?? defaultIntervalMs);
    this.timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs);
  }

  public async syncWith(peer: string): Promise<ClockEstimate> {
    const samples: Exchange[] = [];
    for (let index = 0; index < this.exchanges; index += 1) {
      if (index > 0 && this.intervalMs > 0) await this.wait(this.intervalMs);
      const sample = await this.exchange(peer);
      if (sample) samples.push(sample);
    }
    if (samples.length === 0) {
      throw new Error(`Peer ${peer} did not answer any clock probe.`);
    }
    const estimate = summarizeExchanges(peer, samples, this.nowUs());
    this.estimates.set(peer, estimate);
    return estimate;
  }

  /** Handles a clock probe envelope. Returns true when the message was consumed. */
  public handleMessage(peer: string, type: string, payload: unknown): boolean {
    if (type !== clockProbeSchema) return false;
    const probe = parseClockProbe(payload);
    if (!probe) return true;
    if (probe.kind === 'ping') {
      const t1Us = this.nowUs();
      this.send(peer, clockProbeSchema, createClockPong(probe, t1Us, this.nowUs()));
      return true;
    }
    const resolve = this.pending.get(this.key(peer, probe.sequence));
    if (resolve) {
      this.pending.delete(this.key(peer, probe.sequence));
      resolve(probe);
    }
    return true;
  }

  public estimate(peer: string): ClockEstimate | undefined {
    return this.estimates.get(peer);
  }

  public quality(peer: string): ClockQuality | null {
    const estimate = this.estimates.get(peer);
    if (!estimate) return null;
    return {
      offsetUs: estimate.offsetUs,
      rttUs: estimate.rttUs,
      uncertaintyUs: estimate.uncertaintyUs,
      samples: estimate.samples
    };
  }

  public offsetUsTo(peer: string): number {
    return this.estimates.get(peer)?.offsetUs ?? 0;
  }

  public rttUsTo(peer: string): number {
    return this.estimates.get(peer)?.rttUs ?? 0;
  }

  public uncertaintyUsTo(peer: string): number {
    return this.estimates.get(peer)?.uncertaintyUs ?? 0;
  }

  public hasEstimate(peer: string): boolean {
    return this.estimates.has(peer);
  }

  /** Converts a local microsecond timestamp into the named peer's clock. */
  public toPeerTimeUs(peer: string, localUs: number): number {
    return localUs + this.offsetUsTo(peer);
  }

  public localTimeUs(): number {
    return this.nowUs();
  }

  public forget(peer: string): void {
    this.estimates.delete(peer);
  }

  private async exchange(peer: string): Promise<Exchange | undefined> {
    const sequence = this.sequence++;
    const key = this.key(peer, sequence);
    const ping = createClockPing(sequence, this.nowUs());
    const answered = new Promise<ClockPong | undefined>((resolve) => {
      this.pending.set(key, resolve);
      void this.wait(this.timeoutMs).then(() => {
        if (this.pending.delete(key)) resolve(undefined);
      });
    });
    this.send(peer, clockProbeSchema, ping);
    const pong = await answered;
    if (!pong) return undefined;
    const t3Us = this.nowUs();
    return {
      offsetUs: (pong.t1Us - pong.t0Us + (pong.t2Us - t3Us)) / 2,
      rttUs: t3Us - pong.t0Us - (pong.t2Us - pong.t1Us)
    };
  }

  private key(peer: string, sequence: number): string {
    return `${peer}#${sequence}`;
  }
}

export function summarizeExchanges(
  peer: string,
  samples: readonly Exchange[],
  updatedAtUs: number
): ClockEstimate {
  const sorted = [...samples].sort((left, right) => left.rttUs - right.rttUs);
  const keep = Math.max(1, Math.round(sorted.length / 4));
  const best = sorted.slice(0, keep);
  const offsetUs = best.reduce((total, sample) => total + sample.offsetUs, 0) / best.length;
  const rttUs = sorted[0]?.rttUs ?? 0;
  return {
    peer,
    offsetUs,
    rttUs,
    uncertaintyUs: rttUs / 2,
    samples: samples.length,
    updatedAtUs
  };
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
