import {describe, expect, it, vi} from 'vitest';
import {
  decodePairingCode,
  encodePairingCode,
  parseEnvelope,
  parsePayload,
  protocolVersion,
  serializeEnvelope
} from '../src/protocol.js';

describe('protocol', () => {
  it('round-trips pairing codes as compact base64url text', () => {
    const code = encodePairingCode({
      version: protocolVersion,
      kind: 'offer',
      description: {type: 'offer', sdp: 'v=0'}
    });

    expect(code).not.toContain('+');
    expect(code).not.toContain('/');
    expect(code).not.toContain('=');
    expect(decodePairingCode(code)).toEqual({
      version: protocolVersion,
      kind: 'offer',
      description: {type: 'offer', sdp: 'v=0'}
    });
  });

  it('parses JSON payloads and falls back to raw strings', () => {
    expect(parsePayload('{"door":"open"}')).toEqual({door: 'open'});
    expect(parsePayload('door-open')).toBe('door-open');
    expect(parsePayload('')).toEqual({});
  });

  it('serializes and parses event envelopes', () => {
    vi.setSystemTime(new Date('2026-08-25T00:00:00Z'));
    const serialized = serializeEnvelope({
      version: protocolVersion,
      id: 'message-1',
      seq: 1,
      from: 'host',
      channel: 'default',
      type: 'door-open',
      payload: {pin: 1},
      timestamp: Date.now()
    });

    expect(parseEnvelope('peer-a', serialized)).toEqual({
      version: protocolVersion,
      id: 'message-1',
      seq: 1,
      from: 'host',
      peer: 'peer-a',
      channel: 'default',
      type: 'door-open',
      payload: {pin: 1},
      timestamp: Date.now()
    });
  });
});
