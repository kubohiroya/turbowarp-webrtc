import {describe, expect, it} from 'vitest';
import {
  FrameSyncRegistry,
  LatencySampleStore,
  createFrameSyncReport,
  frameLatencyUs,
  percentile,
  summarizeLatencies
} from '../src/frame-sync.js';
import type {LatencyStats} from '../src/sync-protocol.js';

function statsWithMedian(median: number): LatencyStats {
  return {
    count: 10,
    min: median - 5,
    p10: median - 4,
    median,
    p90: median + 4,
    max: median + 5,
    mean: median,
    mad: 1,
    stddev: 2
  };
}

describe('frameLatencyUs', () => {
  it('subtracts the pattern time from the capture time', () => {
    expect(frameLatencyUs(1_000_120, 1_000_000, 0)).toBe(120);
  });

  it('unwraps a pattern that repeats', () => {
    // The pattern counter wrapped between display and capture: 4060 -> 4096 -> 10.
    expect(frameLatencyUs(10_000, 4_060_000, 4_096_000)).toBe(46_000);
  });

  it('keeps the raw difference when the pattern never repeats', () => {
    expect(frameLatencyUs(10_000, 4_060_000, 0)).toBe(-4_050_000);
  });

  it('keeps a slightly negative latency negative instead of wrapping it', () => {
    // Subtracting an over-large frame age can push the difference below zero.
    // Folding that to a positive residue would report a 4094 ms outlier.
    expect(frameLatencyUs(998_000, 1_000_000, 4_096_000)).toBe(-2_000);
    expect(frameLatencyUs(1_000_000, 1_000_000, 4_096_000)).toBe(0);
  });
});

describe('summarizeLatencies', () => {
  it('reports order statistics and spread', () => {
    const stats = summarizeLatencies([10, 20, 30, 40, 50]);

    expect(stats).toMatchObject({count: 5, min: 10, median: 30, max: 50, mean: 30});
    expect(stats?.mad).toBe(10);
    expect(stats?.stddev).toBeCloseTo(Math.sqrt(200), 6);
  });

  it('ignores values that are not finite', () => {
    expect(summarizeLatencies([Number.NaN, 5, Number.POSITIVE_INFINITY])).toMatchObject({
      count: 1,
      median: 5
    });
  });

  it('returns undefined without usable samples', () => {
    expect(summarizeLatencies([])).toBeUndefined();
  });

  it('interpolates percentiles between neighbours', () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
  });
});

describe('LatencySampleStore', () => {
  it('groups samples per camera and drops the oldest beyond the limit', () => {
    const store = new LatencySampleStore(3);
    for (const value of [1, 2, 3, 4]) store.add('camera-1', value);
    store.add('camera-2', 9);
    store.add('camera-1', Number.NaN);

    expect(store.count('camera-1')).toBe(3);
    expect(store.values('camera-1')).toEqual([2, 3, 4]);
    expect(store.cameras()).toEqual(['camera-1', 'camera-2']);

    store.clear('camera-1');
    expect(store.count('camera-1')).toBe(0);
    expect(store.cameras()).toEqual(['camera-2']);
  });
});

describe('FrameSyncRegistry', () => {
  it('offsets every camera against the median of the reported medians', () => {
    const registry = new FrameSyncRegistry();
    for (const [cameraId, median] of [
      ['camera-1', 40],
      ['camera-2', 60],
      ['camera-3', 50]
    ] as const) {
      registry.accept(
        createFrameSyncReport({
          cameraId,
          referencePeer: 'host',
          measuredAtUs: 1_000,
          latencyUs: statsWithMedian(median),
          clock: {offsetUs: 1000, rttUs: 4000, uncertaintyUs: 2000, samples: 24}
        }),
        `peer-${cameraId}`,
        2_000
      );
    }

    expect(registry.cameras()).toEqual(['camera-1', 'camera-2', 'camera-3']);
    expect(registry.referenceLatencyUs()).toBe(50);
    expect(registry.latencyUsOf('camera-1')).toBe(40);
    expect(registry.offsetUsOf('camera-1')).toBe(-10);
    expect(registry.offsetUsOf('camera-2')).toBe(10);
    expect(registry.offsetUsOf('camera-3')).toBe(0);

    const overview = registry.overview();
    expect(overview.referenceLatencyUs).toBe(50);
    expect(overview.cameras.map((camera) => camera.offsetUs)).toEqual([-10, 10, 0]);
    expect(overview.cameras[0]).toMatchObject({peer: 'peer-camera-1', referencePeer: 'host'});
  });

  it('reports zero for cameras that never reported', () => {
    const registry = new FrameSyncRegistry();
    expect(registry.latencyUsOf('camera-1')).toBe(0);
    expect(registry.offsetUsOf('camera-1')).toBe(0);
    expect(registry.overview()).toEqual({referenceLatencyUs: 0, cameras: []});
  });
});
