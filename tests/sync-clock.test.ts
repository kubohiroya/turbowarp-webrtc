import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ClockSync} from '../src/sync-clock.js';
import {clockProbeSchema, createClockPing, parseClockProbe} from '../src/sync-protocol.js';

const uplinkMs = 4;
const downlinkMs = 6;
const remoteOffsetUs = 1_234_500;

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
  return localNowUs() + remoteOffsetUs;
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
    expect(estimate.offsetUs).toBeCloseTo(remoteOffsetUs + ((uplinkMs - downlinkMs) * 1000) / 2, 6);
    expect(estimate.rttUs).toBeCloseTo((uplinkMs + downlinkMs) * 1000, 6);
    expect(estimate.uncertaintyUs).toBeCloseTo(((uplinkMs + downlinkMs) * 1000) / 2, 6);
    expect(estimate.samples).toBe(8);
    expect(local.hasEstimate('host')).toBe(true);
    expect(local.toPeerTimeUs('host', 1000)).toBeCloseTo(1000 + estimate.offsetUs, 6);
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

  it('gives up after a few silent probes instead of draining the budget', async () => {
    const sent: number[] = [];
    const clock = new ClockSync({
      nowUs: localNowUs,
      exchanges: 24,
      intervalMs: 1,
      timeoutMs: 50,
      send: () => sent.push(Date.now())
    });

    const pending = clock.syncWith('host');
    const assertion = expect(pending).rejects.toThrow('did not answer 3 clock probes');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    // A peer without clock probe support must not stall 24 timeouts long.
    expect(sent).toHaveLength(3);
    expect(clock.hasEstimate('host')).toBe(false);
    expect(clock.offsetUsTo('host')).toBe(0);
  });
});
