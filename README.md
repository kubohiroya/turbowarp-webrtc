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
- Clock probe blocks that align peer clocks over the DataChannel.
- Frame sync latency measurement with per-camera aggregation.

## Requirements and safety

This extension must run as an unsandboxed extension. It uses WebRTC DataChannel APIs for transport and TurboWarp VM runtime APIs to start network message hat blocks. Loading it as a sandboxed extension fails at startup.

LAN mode avoids public STUN servers and is the default for local-room deployments. STUN mode can improve connectivity across networks but sends ICE discovery traffic to public STUN infrastructure. Manual signaling codes include connection descriptions and ICE candidates; exchange them only through a trusted channel and discard stale codes after pairing. Run `close peer [PEER]` when a connection is no longer needed so the underlying peer connection and DataChannel are closed.

## Installation

Install the package for local builds:

```sh
pnpm add @kubohiroya/turbowarp-webrtc@0.2.0
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

## Frame sync measurement

Computers that film the same subject do not finish recording a frame at the same moment. These blocks measure that difference so that data captured on several computers can be placed on one timeline.

The measurement needs a display whose content encodes the time at which it was shown. One computer shows that pattern, a projector puts it in front of every camera, and each camera computer decodes the pattern out of its own frames. Showing the pattern and decoding it are application concerns and live in the [multiview-pose](https://github.com/kubohiroya/multiview-pose/issues/8) applications; this extension provides the clock probe and the reporting path that turn those observations into comparable numbers.

Every timestamp and duration these blocks accept or return is in **microseconds**, matching the `twmp/clock-probe` contract and the pose frame capture timestamp, so the same value can be passed to both extensions without conversion.

### 1. Align the clocks

`sync clock with peer [PEER]` runs a `twmp/clock-probe` version 1 exchange over the existing DataChannel. Every exchange records the request send time, the remote receive time, the remote reply time, and the reply arrival time. The offset is averaged over the fastest quarter of the exchanges, because the shortest round trips carry the least queuing noise.

- `clock offset to peer [PEER] us`: microseconds to add to a local timestamp to express it in the peer's clock.
- `clock round trip to peer [PEER] us`: the shortest round trip observed while probing.
- `clock uncertainty to peer [PEER] us`: half that round trip, which bounds the residual offset error.
- `time in clock of peer [PEER] us` and `local time us`: read either clock directly.

Probe traffic uses the reserved internal channel `twmp/sync` and never enters the receive queue, so probing at a high rate cannot evict application messages. The transport claims only its own two payloads there, so nothing a project sends can disappear into it. A peer that does not answer gives up after three silent probes rather than draining the whole exchange budget.

### 2. Collect samples

For every decoded frame, `record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]` turns one observation into a latency sample:

```text
latency = (CAPTURE_US + clock offset to PEER) - PATTERN_US
```

`CAPTURE_US` is the local timestamp of the recorded frame, `PATTERN_US` is the display time decoded out of that frame, and `WRAP_US` is the period after which the displayed time repeats: 4096000 for a 12 bit millisecond pattern, or 0 when the pattern never repeats. Both blocks fail if the peer clock has not been probed, because an unprobed offset of zero would compare two unrelated wall clocks and still produce a plausible looking number.

Wrapping resolves to the half wrap period nearest zero, so the measurement is correct while the true latency stays within half the wrap period, and a latency that comes out slightly negative stays negative instead of becoming an outlier just under a full period. A negative sample means the clock offset or a frame age correction was larger than the real latency; it is a signal to re-probe the clock, not a measurement to keep. `frame latency us for capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]` returns the same number without storing it, which suits a live readout.

### 3. Report and aggregate

`send frame sync report for camera [CAMERA] to peer [PEER]` summarizes the stored samples and sends them as a `twmp/frame-sync-report` version 1 payload:

```json
{
  "schema": "twmp/frame-sync-report",
  "version": 1,
  "cameraId": "camera-1",
  "referencePeer": "host",
  "measuredAtUs": 1787616000000000,
  "latencyUs": {
    "count": 240,
    "min": 38200,
    "p10": 41000,
    "median": 47500,
    "p90": 62400,
    "max": 71900,
    "mean": 49100,
    "mad": 5200,
    "stddev": 7800
  },
  "clock": {"offsetUs": -12400, "rttUs": 3100, "uncertaintyUs": 1550, "samples": 24}
}
```

On the aggregating computer, `frame sync report` returns every received report together with the per-camera offsets, `frame sync latency us of camera [CAMERA]` returns that camera's median latency, and `frame sync offset us of camera [CAMERA]` returns how much later that camera finishes recording a frame than the reference camera. The reference is the median of the per-camera medians. Subtracting a camera's offset from its frame timestamps puts every camera on one timeline.

Latency is summarized as median, MAD, and the 10th and 90th percentiles instead of a mean alone, because camera pipelines delay and drop frames asymmetrically. A delay shared by every camera, such as the projector and the display pipeline, stays in the absolute latency but cancels out of the offsets.

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

### `sync clock with peer [PEER]`

Runs a clock probe exchange with the peer and stores the resulting clock offset.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `syncClock` |
| `PEER` | String, default: `peer-a` |

### `clock offset to peer [PEER] us`

Returns the microseconds to add to a local timestamp to express it in the peer's clock.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `clockOffset` |
| `PEER` | String, default: `peer-a` |

### `clock round trip to peer [PEER] us`

Returns the shortest round trip observed while probing the peer, in microseconds.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `clockRoundTrip` |
| `PEER` | String, default: `peer-a` |

### `clock uncertainty to peer [PEER] us`

Returns the clock offset uncertainty for the peer in microseconds, which is half the shortest round trip.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `clockUncertainty` |
| `PEER` | String, default: `peer-a` |

### `time in clock of peer [PEER] us`

Returns the current local time expressed in the peer's clock, in microseconds. Errors when the peer clock has not been probed yet.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `peerTime` |
| `PEER` | String, default: `peer-a` |

### `local time us`

Returns the local high-resolution clock in microseconds.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `localTime` |

### `frame latency us for capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]`

Returns how many microseconds after the displayed pattern time the local frame was captured. CAPTURE_US is a local timestamp, PATTERN_US is the decoded display time in the peer's clock, and WRAP_US is the pattern repeat period, or 0 when the pattern never repeats. Errors when the peer clock has not been probed yet. A negative result means the clock offset or the frame age correction exceeded the real latency.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameLatency` |
| `CAPTURE_US` | Number, default: `0` |
| `PATTERN_US` | Number, default: `0` |
| `WRAP_US` | Number, default: `4096000` |
| `PEER` | String, default: `peer-a` |

### `record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]`

Converts one pattern observation into a latency sample and stores it for the camera slot. Errors when the peer clock has not been probed yet.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `recordFrameSyncSample` |
| `CAMERA` | String, default: `camera-1` |
| `CAPTURE_US` | Number, default: `0` |
| `PATTERN_US` | Number, default: `0` |
| `WRAP_US` | Number, default: `4096000` |
| `PEER` | String, default: `peer-a` |

### `clear frame sync samples for camera [CAMERA]`

Clears the latency samples stored for the camera slot.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `clearFrameSyncSamples` |
| `CAMERA` | String, default: `camera-1` |

### `frame sync sample count for camera [CAMERA]`

Returns how many latency samples are stored for the camera slot.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncSampleCount` |
| `CAMERA` | String, default: `camera-1` |

### `frame sync summary for camera [CAMERA]`

Returns the local latency summary for the camera slot as a JSON report.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncSummary` |
| `CAMERA` | String, default: `camera-1` |

### `send frame sync report for camera [CAMERA] to peer [PEER]`

Sends the camera slot's latency summary to the peer on the internal sync channel.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `sendFrameSyncReport` |
| `CAMERA` | String, default: `camera-1` |
| `PEER` | String, default: `peer-a` |

### `frame sync report`

Returns every received frame sync report together with per-camera offsets as JSON.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncReport` |

### `frame sync cameras`

Returns a JSON array of the camera slots that have reported.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncCameras` |

### `frame sync latency us of camera [CAMERA]`

Returns the reported median capture latency of the camera slot in microseconds.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncLatencyOfCamera` |
| `CAMERA` | String, default: `camera-1` |

### `frame sync offset us of camera [CAMERA]`

Returns how many microseconds later than the reference camera this camera finishes recording a frame. Subtract it from the camera's frame timestamps to align the cameras.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameSyncOffsetOfCamera` |
| `CAMERA` | String, default: `camera-1` |

### `clear frame sync report`

Clears every received frame sync report.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `clearFrameSyncReport` |

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
