# turbowarp-webrtc

TurboWarp向けの手動ペアリング型WebRTC DataChannel拡張です。TM紙芝居やリアル脱出ゲームのような、複数端末・物理イベント連携ランタイムの低レベル通信路として使うことを目的にしています。

## 目的

- 常駐signalingサーバを置かない。
- offer/answerをコピペまたはQRコードで手動交換する。
- 音声・映像なし、DataChannel専用。
- 既定はLAN優先のICE設定。
- JSON event envelopeと受信キューを持つ。
- 名前付きpeerを複数扱える。
- ネットワーク越しのmessage受信でTurboWarpのhat blockを起動できる。

## 実行条件

この拡張はunsandboxed extensionとして読み込む必要があります。WebRTC DataChannel自体に加えて、network messageのhat blockを起動するためにTurboWarp VMのruntime APIを使います。sandboxed extensionとして読み込まれた場合は起動時にエラーになります。

## ペアリング手順

1. ホスト側で `create offer code for peer [PEER]` を実行する。
2. `offer code for peer [PEER]` を参加側へ渡す。
3. 参加側で `accept offer code [CODE] as peer [PEER]` を実行する。
4. `answer code for peer [PEER]` をホスト側へ返す。
5. ホスト側で `accept answer code [CODE] for peer [PEER]` を実行する。
6. connection stateが `connected` になったらeventを送信する。

## Network broadcast

`broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]` は、既存のJSON envelopeを使ってpeerへmessageを送信します。`PEER` に `*` を指定すると、接続済みの全peerへ送信します。

受信側では `when I receive network message [MESSAGE]` が起動します。`MESSAGE` には受信したenvelopeの `type` が使われます。`MESSAGE` に `*` を指定したhatは、すべてのnetwork messageを受け取る共通ハンドラとして使えます。

hat配下では次のreporterで受信内容を読めます。

- `network message payload`: payloadをJSON文字列で返す。
- `network message sender`: 送信元のlocal IDを返す。
- `network message peer`: この接続で使っているpeer名を返す。
- `network message channel`: envelopeのchannelを返す。

`broadcast ... and wait` 相当のブロックはまだありません。リモート側のscript完了を待つにはACK/完了通知プロトコルが必要なため、通常のnetwork broadcastとは別機能として扱います。

## メッセージ形式

`send event` と `broadcast network message` はpayloadをJSON envelopeとして送信します。

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

## 開発

```sh
npm install
npm run check
```

ビルド結果は `dist/turbowarp-webrtc.js` です。

## ライセンス

このプロジェクトは Mozilla Public License 2.0 の下でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。
