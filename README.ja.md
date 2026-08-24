# turbowarp-webrtc

TurboWarp向けの手動ペアリング型WebRTC DataChannel拡張です。TM紙芝居やリアル脱出ゲームのような、複数端末・物理イベント連携ランタイムの低レベル通信路として使うことを目的にしています。

## 目的

- 常駐signalingサーバを置かない。
- offer/answerをコピペまたはQRコードで手動交換する。
- 音声・映像なし、DataChannel専用。
- 既定はLAN優先のICE設定。
- JSON event envelopeと受信キューを持つ。
- 名前付きpeerを複数扱える。

## ペアリング手順

1. ホスト側で `create offer code for peer [PEER]` を実行する。
2. `offer code for peer [PEER]` を参加側へ渡す。
3. 参加側で `accept offer code [CODE] as peer [PEER]` を実行する。
4. `answer code for peer [PEER]` をホスト側へ返す。
5. ホスト側で `accept answer code [CODE] for peer [PEER]` を実行する。
6. connection stateが `connected` になったらeventを送信する。

## メッセージ形式

`send event` はpayloadをJSON envelopeとして送信します。

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

受信メッセージには追加で `peer` フィールドが入ります。

## Blocks

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

## 開発

```sh
npm install
npm run check
```

ビルド結果は `dist/turbowarp-webrtc.js` です。
