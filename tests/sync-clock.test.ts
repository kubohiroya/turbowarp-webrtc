import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ClockSync} from '../src/sync-clock.js';
import {clockProbeSchema, createClockPing, parseClockProbe} from '../src/sync-protocol.js';

const uplinkMs = 4;
const downlinkMs = 6;
const remoteOffsetMs = 1234.5;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function localNowUs(): number {
  return Date.now() * 1000;
}

function remoteNowUs(): number {
  return Math.round(localNowUs() + remoteOffsetMs * 1000);
}

describe('ClockSync', () => {
  it('estimates the offset and round trip of a peer clock', async () => {
    const link: {local?: ClockSync; remote?: ClockSync} = {};
    const local = new ClockSync({
      nowUs: localNowUs,
      exchanges: 8,
      intervalMs: 5,
      timeoutMs: 500,
      send: (peer, type, payload) => {
        setTimeout(() => link.remote?.handleMessage(peer, type, payload), uplinkMs);
      }
    });
    const remote = new ClockSync({
      nowUs: remoteNowUs,
      send: (peer, type, payload) => {
        setTimeout(() => link.local?.handleMessage(peer, type, payload), downlinkMs);
      }
    });
    link.local = local;
    link.remote = remote;

    const pending = local.syncWith('host');
    await vi.advanceTimersByTimeAsync(2000);
    const estimate = await pending;

    // An asymmetric path biases the offset by half the path difference.
    expect(estimate.offsetMs).toBeCloseTo(remoteOffsetMs + (uplinkMs - downlinkMs) / 2, 6);
    expect(estimate.rttMs).toBeCloseTo(uplinkMs + downlinkMs, 6);
    expect(estimate.uncertaintyMs).toBeCloseTo((uplinkMs + downlinkMs) / 2, 6);
    expect(estimate.samples).toBe(8);
    expect(local.hasEstimate('host')).toBe(true);
    expect(local.toPeerTimeMs('host', 1000)).toBeCloseTo(1000 + estimate.offsetMs, 6);
  });

  it('answers a ping with the four probe timestamps', () => {
    const sent: unknown[] = [];
    const responder = new ClockSync({
      nowUs: () => 7_000_000,
      send: (_peer, _type, payload) => {
        sent.push(payload);
      }
    });

    const handled = responder.handleMessage('host', clockProbeSchema, createClockPing(3, 5_000_000));

    expect(handled).toBe(true);
    const pong = parseClockProbe(sent[0]);
    expect(pong).toMatchObject({
      kind: 'pong',
      sequence: 3,
      t0Us: 5_000_000,
      t1Us: 7_000_000,
      t2Us: 7_000_000
    });
  });

  it('ignores envelopes that are not clock probes', () => {
    const clock = new ClockSync({send: () => undefined});
    expect(clock.handleMessage('host', 'door-open', {})).toBe(false);
  });

  it('rejects when the peer never answers', async () => {
    const clock = new ClockSync({
      nowUs: localNowUs,
      exchanges: 2,
      intervalMs: 1,
      timeoutMs: 50,
      send: () => undefined
    });

    const pending = clock.syncWith('host');
    const assertion = expect(pending).rejects.toThrow('did not answer');
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(clock.hasEstimate('host')).toBe(false);
    expect(clock.offsetMsTo('host')).toBe(0);
  });
});
