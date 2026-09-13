# TurboWarp WebRTC

[English](README.md)

TurboWarp向けの手動ペアリング型WebRTC DataChannel拡張です。TM Kamishibaiやリアル脱出ゲームのような、複数端末・物理イベント連携ランタイムの低レベル通信路として使うことを目的にしています。

## What it does

- 常駐signalingサーバを置かない。
- offer/answerをコピペまたはQRコードで手動交換する。
- 音声・映像なし、DataChannel専用。
- 既定はLAN優先のICE設定。
- JSON event envelopeと受信キューを持つ。
- 名前付きpeerを複数扱える。
- ネットワーク越しのmessage受信でTurboWarpのhat blockを起動できる。
- DataChannel上でpeer間の時計を合わせるclock probe blockを持つ。
- フレーム同期のlatency計測とカメラ別集計ができる。

## Requirements and safety

この拡張はunsandboxed extensionとして読み込む必要があります。WebRTC DataChannel自体に加えて、network messageのhat blockを起動するためにTurboWarp VMのruntime APIを使います。sandboxed extensionとして読み込まれた場合は起動時にエラーになります。

LAN modeはpublic STUN serverを使わず、同じ部屋・同一LAN内の配置向けの既定値です。STUN modeはネットワーク越えの接続性を上げられる場合がありますが、public STUN infrastructureへICE discovery trafficを送ります。manual signaling codeにはconnection descriptionとICE candidateが含まれるため、信頼できる経路でだけ交換し、pairing後の古いcodeは破棄してください。接続終了時は `close peer [PEER]` を実行し、peer connectionとDataChannelを閉じます。

## Installation

ローカルビルドではpackageをinstallします。

```sh
pnpm add @kubohiroya/turbowarp-webrtc@0.1.0
```

TurboWarpへ読み込む場合は生成済みのunsandboxed bundle `dist/turbowarp-webrtc.js` を使います。

## Quick start

1. ホスト側で `create offer code for peer [PEER]` を実行する。
2. `offer code for peer [PEER]` を参加側へ渡す。
3. 参加側で `accept offer code [CODE] as peer [PEER]` を実行する。
4. `answer code for peer [PEER]` をホスト側へ返す。
5. ホスト側で `accept answer code [CODE] for peer [PEER]` を実行する。
6. connection stateが `connected` になったらeventを送信する。

## Block reference

`src/block-definitions.json` から生成しています。生成範囲は手で編集しないでください。

## Network broadcast

`broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]` は、既存のJSON envelopeを使ってpeerへmessageを送信します。`PEER` に `*` を指定すると、接続済みの全peerへ送信します。

受信側では `when I receive network message [MESSAGE]` が起動します。`MESSAGE` には受信したenvelopeの `type` が使われます。`MESSAGE` に `*` を指定したhatは、すべてのnetwork messageを受け取る共通ハンドラとして使えます。

hat配下では次のreporterで受信内容を読めます。

- `network message payload`: payloadをJSON文字列で返す。
- `network message sender`: 送信元のlocal IDを返す。
- `network message peer`: この接続で使っているpeer名を返す。
- `network message channel`: envelopeのchannelを返す。

`broadcast ... and wait` 相当のブロックはまだありません。リモート側のscript完了を待つにはACK/完了通知プロトコルが必要なため、通常のnetwork broadcastとは別機能として扱います。

## Frame sync measurement

同じ被写体を撮る複数台のPCは、同じ瞬間にフレームを記録し終えるわけではありません。これらのblockはその差を計測し、複数PCで撮ったデータを1本の時間軸に載せられるようにします。

計測には「表示された時刻そのものを符号化した画面」が必要です。1台のPCがそのパターンを表示し、プロジェクタで各カメラの視野に投影し、カメラ側の各PCが自分のフレームからパターンを復号します。パターンの表示と復号はアプリケーション側の関心事で、[multiview-pose](https://github.com/kubohiroya/multiview-pose/issues/8) のアプリで実装します。この拡張は、その観測値を比較可能な数値に変えるためのclock probeとレポート経路を提供します。

これらのblockが受け取る・返す時刻と時間はすべて**マイクロ秒**です。`twmp/clock-probe` 契約およびpose frameのcapture timestampと同じ単位なので、同じ値を単位変換なしで両方の拡張へ渡せます。

### 1. 時計を合わせる

`sync clock with peer [PEER]` は、既存のDataChannel上で `twmp/clock-probe` version 1 のやり取りを行います。1回のやり取りで、送信時刻・相手の受信時刻・相手の返信時刻・返信の到着時刻の4点を記録します。offsetは往復時間が短い上位1/4の平均を採ります。往復が短いものほどキュー遅延の混入が少ないためです。

- `clock offset to peer [PEER] us`: ローカル時刻をpeerの時計で表すために足すマイクロ秒。
- `clock round trip to peer [PEER] us`: 観測された最短の往復時間。
- `clock uncertainty to peer [PEER] us`: その半分。offsetの残差の上限にあたります。
- `time in clock of peer [PEER] us` と `local time us`: それぞれの時計を直接読みます。

probeのtrafficは内部channel `sync` を通り、受信キューには入りません。高頻度でprobeしてもアプリケーションのmessageを押し出すことはありません。

### 2. サンプルを集める

復号できたフレームごとに、`record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]` が1件のlatencyサンプルに変換します。

```text
latency = (CAPTURE_US + clock offset to PEER) - PATTERN_US
```

`CAPTURE_US` は記録し終えたフレームのローカル時刻、`PATTERN_US` はそのフレームから復号した表示時刻、`WRAP_US` は表示時刻が一周する周期です。12bitのミリ秒パターンなら4096000、一周しないパターンなら0を指定します。真のlatencyがwrap周期未満であるかぎり、巻き戻りは正しく解決されます。`frame latency us for capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]` は同じ値を保存せずに返すので、実時間表示に使えます。

### 3. 送信して集計する

`send frame sync report for camera [CAMERA] to peer [PEER]` は、蓄積したサンプルを要約し、`twmp/frame-sync-report` version 1 のpayloadとして送信します。

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

集計側のPCでは、`frame sync report` が受信済みの全レポートとカメラごとのoffsetを返し、`frame sync latency us of camera [CAMERA]` がそのカメラのlatency中央値を返し、`frame sync offset us of camera [CAMERA]` が基準カメラよりどれだけ遅れてフレームを記録し終えるかを返します。基準はカメラごとの中央値の中央値です。各カメラのフレーム時刻からそのoffsetを引けば、全カメラが1本の時間軸に揃います。

latencyは平均だけでなく中央値・MAD・10/90パーセンタイルで要約します。カメラのパイプラインは非対称に遅延・欠落するためです。プロジェクタや表示パイプラインのように全カメラ共通の遅延は、絶対値としてのlatencyには残りますが、offsetでは相殺されます。

## Runtime behavior

この拡張は既存のWebRTC protocol、JSON message envelope、receive queue、hat block起動、Extension ID、opcodeを変更しません。実ブラウザ同士のpairing検証は別途 [issue #2](https://github.com/kubohiroya/turbowarp-webrtc/issues/2) で扱います。

## Message envelope

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

## Compatibility and network limitations

WebRTCの利用可否はbrowserとnetwork policyに依存します。LAN modeは同一network内の端末向けの予測しやすい既定値です。STUN modeでも、制限の強いNATやfirewallでは接続できない場合があります。このpackageはTURN relayやsignaling serverを提供しません。

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

Returns the current local time expressed in the peer's clock, in microseconds.

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

Returns how many microseconds after the displayed pattern time the local frame was captured. CAPTURE_US is a local timestamp, PATTERN_US is the decoded display time in the peer's clock, and WRAP_US is the pattern repeat period, or 0 when the pattern never repeats.

| Property | Value |
|---|---|
| Type | Reporter |
| Opcode | `frameLatency` |
| `CAPTURE_US` | Number, default: `0` |
| `PATTERN_US` | Number, default: `0` |
| `WRAP_US` | Number, default: `4096000` |
| `PEER` | String, default: `peer-a` |

### `record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]`

Converts one pattern observation into a latency sample and stores it for the camera slot.

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

## 開発

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

ビルド結果は `dist/turbowarp-webrtc.js` です。

## Release

公開前に `pnpm run release:check` を実行します。full check suite、`npm pack --dry-run --ignore-scripts` によるpackage archive検査、`pnpm publish --dry-run --access public --no-git-checks` をまとめて実行します。未公開のmetadata変更はrelease PRをrevertして戻します。

## ライセンス

SPDX-License-Identifier: MPL-2.0

このプロジェクトは Mozilla Public License 2.0 の下でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。
