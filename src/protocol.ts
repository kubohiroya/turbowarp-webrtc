export const protocolVersion = 1;

export type PairingKind = 'offer' | 'answer';

export interface PairingCode {
  version: typeof protocolVersion;
  kind: PairingKind;
  description: RTCSessionDescriptionInit;
}

export interface EventEnvelope {
  version: typeof protocolVersion;
  id: string;
  seq: number;
  from: string;
  channel: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface ReceivedEnvelope extends EventEnvelope {
  peer: string;
}

export function encodePairingCode(code: PairingCode): string {
  return encodeBase64Url(JSON.stringify(code));
}

export function decodePairingCode(value: string): PairingCode {
  const parsed = JSON.parse(decodeBase64Url(value.trim())) as Partial<PairingCode>;
  if (parsed.version !== protocolVersion) {
    throw new Error(`Unsupported pairing code version: ${String(parsed.version)}`);
  }
  if (parsed.kind !== 'offer' && parsed.kind !== 'answer') {
    throw new Error('Pairing code kind must be offer or answer.');
  }
  if (!parsed.description || typeof parsed.description.type !== 'string') {
    throw new Error('Pairing code does not contain a session description.');
  }
  return parsed as PairingCode;
}

export function parsePayload(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function serializeEnvelope(envelope: EventEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseEnvelope(peer: string, value: string): ReceivedEnvelope {
  const parsed = JSON.parse(value) as Partial<EventEnvelope>;
  if (parsed.version !== protocolVersion) {
    throw new Error(`Unsupported message version: ${String(parsed.version)}`);
  }
  if (typeof parsed.id !== 'string' || typeof parsed.type !== 'string') {
    throw new Error('Message is missing required fields.');
  }
  return {...(parsed as EventEnvelope), peer};
}

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
