import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import packageMetadata from '../package.json';
import * as syncProtocol from '../src/sync-protocol.js';

const ENTRY = new URL('../src/sync-protocol.ts', import.meta.url);

/**
 * The published sub-entry, guarded.
 *
 * Other packages compile this file into their own bundles so that the wire
 * format has one definition rather than a copy on each side of the link. That
 * only works while the file stays free of imports and of anything that needs a
 * browser: a single import added here reaches every consumer's bundle, and an
 * import of the extension itself would pull in sixty kilobytes and the call
 * that registers it with TurboWarp.
 */
describe('the published sync sub-entry', () => {
  it('is exposed under ./sync and nowhere else', () => {
    // No "." entry: dist/turbowarp-webrtc.js is loaded by URL from TurboWarp,
    // not imported, and exposing it here would let a stray bare import pull the
    // whole extension into a consumer's bundle.
    // Compiled rather than published as source: Node refuses to strip types
    // from anything under node_modules, so a consumer that is not run through a
    // bundler could not have imported the TypeScript file at all.
    expect(packageMetadata.exports['./sync']).toEqual({
      types: './dist/sync-protocol.d.ts',
      default: './dist/sync-protocol.js'
    });
    expect(Object.keys(packageMetadata.exports)).toEqual(['./sync', './package.json']);
  });

  it('does not claim the package is free of side effects', () => {
    // src/index.ts calls Scratch.extensions.register. Declaring the package
    // side-effect free would let a bundler drop that call.
    expect(packageMetadata.sideEffects).toEqual(['src/index.ts', 'dist/*']);
  });

  it('imports nothing', async () => {
    const source = await readFile(ENTRY, 'utf8');
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(/\brequire\s*\(/u);
  });

  it('reaches for nothing a browser has to provide', async () => {
    const source = await readFile(ENTRY, 'utf8');
    for (const global of ['document', 'window', 'navigator', 'Scratch', 'RTCPeerConnection']) {
      expect(source).not.toMatch(new RegExp(`\\b${global}\\b`, 'u'));
    }
  });

  it('publishes exactly the names consumers were promised', () => {
    // Removing or renaming one of these breaks a consumer that compiled
    // against it, so the list is a contract and changing it needs a version.
    expect(Object.keys(syncProtocol).sort()).toEqual([
      'clockProbeSchema',
      'clockProbeVersion',
      'createClockPing',
      'createClockPong',
      'frameSyncReportSchema',
      'frameSyncReportVersion',
      'nowMicroseconds',
      'parseClockProbe',
      'parseFrameSyncReport',
      'syncChannel'
    ]);
  });

  it('validates a frame sync report the way a consumer will', () => {
    const report = {
      schema: syncProtocol.frameSyncReportSchema,
      version: syncProtocol.frameSyncReportVersion,
      cameraId: 'camera-left',
      referencePeer: 'studio-host',
      measuredAtUs: 1_737_000_000_000_000,
      latencyUs: {
        count: 12,
        min: 1,
        p10: 2,
        median: 3,
        p90: 4,
        max: 5,
        mean: 3,
        mad: 1,
        stddev: 1
      },
      clock: null
    };
    expect(syncProtocol.parseFrameSyncReport(report)).toMatchObject({cameraId: 'camera-left'});
    expect(syncProtocol.parseFrameSyncReport({...report, version: 2})).toBeUndefined();
  });
});
