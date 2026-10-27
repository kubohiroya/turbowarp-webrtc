# Two-tab ping

[Editorで開く](https://turbowarp.org/editor?project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-webrtc%2Fsamples%2Ftwo-tab-ping.sb3) · [SB3](https://kubohiroya.github.io/turbowarp-webrtc/samples/two-tab-ping.sb3)

## 手順と期待結果

緑旗で初期化。タブ1でO→signalをコピー、タブ2でA→貼り付け、タブ2のsignalをコピー、タブ1でF→貼り付け。Sでconnectedを確認してPでping、相手でRを押すと受信JSON。Xで切断。再度緑旗から再実行。

## 要件

WebRTC DataChannel対応ブラウザの2タブ（または同一LANの2端末）。public STUN/TURNは使用しません。signal変数は非表示です。生成後にスクリプト内の `offer code for peer [peer]` / `answer code for peer [peer]` レポーターブロックをクリックし、結果の吹き出しからコードを選択してコピーしてください。接続記述を含むため信頼できる経路だけで交換してください。

## 未検証範囲

実2端末・別ネットワーク/NAT/Firewall・長時間接続は未検証。

自動検証は無音（browser `--mute-audio`）で実施し、音声再生・カメラ・外部サービスを自動起動しません。

## 編集と再生成

`two-tab-ping/project.json` とSVGが編集元、`manifest.json` は配信/依存/確認条件です。Node.jsは`.nvmrc`を使用し `node scripts/build-samples.mjs`、`node scripts/build-samples.mjs --check`、`node --test scripts/verify-samples.mjs`、`node scripts/prepare-pages.mjs` で生成・検査します。ZIP日時/エントリー順は固定。SB3のJSは通常の拡張許可画面で非サンドボックス実行を選択します。

## ロールバック

PRをrevertしPagesを再公開します。本体distと既定フラグを変更しません。
