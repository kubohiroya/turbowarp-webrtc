# TurboWarp WebRTC

[日本語](README.ja.md)

Manual WebRTC DataChannel pairing for TurboWarp. This extension is intended as the low-level peer transport for TM Kamishibai and similar physical-event runtimes.

## What it does

- No persistent signaling server.
- Manual offer/answer pairing by copy/paste or QR code.
- DataChannel-only messaging.
- LAN-first ICE configuration by default.
- JSON event envelopes with a receive queue.
- Multiple named peers.
- TurboWarp hat blocks for received network messages.

## Requirements and safety

This extension must run as an unsandboxed extension. It uses WebRTC DataChannel APIs for transport and TurboWarp VM runtime APIs to start network message hat blocks. Loading it as a sandboxed extension fails at startup.

LAN mode avoids public STUN servers and is the default for local-room deployments. STUN mode can improve connectivity across networks but sends ICE discovery traffic to public STUN infrastructure. Manual signaling codes include connection descriptions and ICE candidates; exchange them only through a trusted channel and discard stale codes after pairing. Run `close peer [PEER]` when a connection is no longer needed so the underlying peer connection and DataChannel are closed.

## Installation

Install the package for local builds:

```sh
pnpm add @kubohiroya/turbowarp-webrtc@0.1.0
```

Use the generated unsandboxed bundle from `dist/turbowarp-webrtc.js` when loading the extension into TurboWarp.

## Quick start

1. On the host project, run `create offer code for peer [PEER]`.
2. Copy `offer code for peer [PEER]` to the joining project.
3. On the joining project, run `accept offer code [CODE] as peer [PEER]`.
4. Copy `answer code for peer [PEER]` back to the host project.
5. On the host project, run `accept answer code [CODE] for peer [PEER]`.
6. Send events after the connection state becomes `connected`.

## Block reference

Generated from `src/block-definitions.json`. Do not edit the generated section by hand.

## Network broadcasts

`broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]` sends a message to a peer using the existing JSON envelope format. Set `PEER` to `*` to send to every connected peer.

On the receiving side, `when I receive network message [MESSAGE]` starts matching scripts. `MESSAGE` is matched against the received envelope's `type`. A hat with `MESSAGE` set to `*` acts as a catch-all handler for every network message.

Hat scripts can read the received message with these reporters:

- `network message payload`: returns the payload as a JSON string.
- `network message sender`: returns the sender's local ID.
- `network message peer`: returns the peer name used by this connection.
- `network message channel`: returns the envelope channel.

There is no `broadcast ... and wait` equivalent yet. Waiting for remote scripts to finish requires an ACK/completion protocol, so it is treated as a separate feature from regular network broadcast delivery.

## Runtime behavior

The extension keeps the existing WebRTC protocol, JSON message envelope, receive queue, hat block startup behavior, Extension ID, and opcodes unchanged. Existing browser-to-browser pairing behavior is covered separately by [issue #2](https://github.com/kubohiroya/turbowarp-webrtc/issues/2).

## Message envelope

`send event` and `broadcast network message` serialize payloads as JSON envelopes:

```json
{
  "version": 1,
  "id": "uuid",
  "seq": 1,
  "from": "local-id",
  "channel": "default",
  "type": "door-open",
  "payload": {"pin": 1},
  "timestamp": 1787616000000
}
```

Received messages include an additional `peer` field.

## Compatibility and network limitations

WebRTC availability depends on the browser and network policy. LAN mode is the predictable default for same-network devices; STUN mode may still fail on restrictive NATs or firewalls because this package does not provide a TURN relay or a signaling server.

<!-- BEGIN GENERATED BLOCKS -->

### `set ICE mode [MODE]`

Sets whether new peer connections use LAN-only ICE or public STUN servers.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `setIceMode` |
| `MODE` | String, default: `lan` |

### `create offer code for peer [PEER]`

Creates a manual pairing offer code for the named peer.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `createOffer` |
| `PEER` | String, default: `peer-a` |

### `offer code for peer [PEER]`

Returns the latest offer code generated for the named peer.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `getOffer` |
| `PEER` | String, default: `peer-a` |

### `accept offer code [CODE] as peer [PEER]`

Accepts a peer's offer code and creates an answer code.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `acceptOffer` |
| `CODE` | String, default: `offer-code` |
| `PEER` | String, default: `peer-a` |

### `answer code for peer [PEER]`

Returns the latest answer code generated for the named peer.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `getAnswer` |
| `PEER` | String, default: `peer-a` |

### `accept answer code [CODE] for peer [PEER]`

Completes pairing by accepting a peer's answer code.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `acceptAnswer` |
| `CODE` | String, default: `answer-code` |
| `PEER` | String, default: `peer-a` |

### `send event [TYPE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]`

Sends a JSON event envelope to one peer, or to all peers when PEER is *.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `sendEvent` |
| `TYPE` | String, default: `door-open` |
| `PAYLOAD` | String, default: `{}` |
| `CHANNEL` | String, default: `default` |
| `PEER` | String, default: `*` |

### `broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]`

Sends a network broadcast message envelope to one peer, or to all peers when PEER is *.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `broadcastNetworkMessage` |
| `MESSAGE` | String, default: `door-open` |
| `PAYLOAD` | String, default: `{}` |
| `CHANNEL` | String, default: `default` |
| `PEER` | String, default: `*` |

### `when I receive network message [MESSAGE]`

Starts scripts when a matching network broadcast message is received.

| Property | Value |
|---|---|
| Type | Event |
| Opcode | `whenReceiveNetworkMessage` |
| `MESSAGE` | String, default: `door-open` |

### `network message payload`

Returns the payload of the most recently received network broadcast message as JSON.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `networkMessagePayload` |

### `network message sender`

Returns the sender ID of the most recently received network broadcast message.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `networkMessageSender` |

### `network message peer`

Returns the local peer name that received the most recent network broadcast message.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `networkMessagePeer` |

### `network message channel`

Returns the channel of the most recently received network broadcast message.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `networkMessageChannel` |

### `has received messages?`

Reports whether the receive queue contains at least one message.

| Property | Value |
|---|---|
| Type | Boolean |
| Opcode | `hasMessages` |

### `received message count`

Returns the number of messages currently waiting in the receive queue.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `messageCount` |

### `next received message`

Removes and returns the oldest received message as JSON.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `nextMessage` |

### `last received message`

Returns the most recent received message as JSON without removing it.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `lastMessage` |

### `clear received messages`

Clears the receive queue.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `clearMessages` |

### `connection state of peer [PEER]`

Returns the WebRTC connection state for the named peer.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `connectionState` |
| `PEER` | String, default: `peer-a` |

### `connected peers`

Returns a JSON array of connected peer names.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `connectedPeers` |

### `close peer [PEER]`

Closes and removes a peer connection.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `closePeer` |
| `PEER` | String, default: `peer-a` |

<!-- END GENERATED BLOCKS -->

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

The build output is `dist/turbowarp-webrtc.js`.

## Release

Run `pnpm run release:check` before publishing. It runs the full check suite, verifies the package archive with `npm pack --dry-run --ignore-scripts`, and performs `pnpm publish --dry-run --access public --no-git-checks`. Roll back unpublished metadata changes by reverting the release PR.

## License

SPDX-License-Identifier: MPL-2.0

This project is licensed under the Mozilla Public License 2.0. See [LICENSE](LICENSE).
