<div align="center">

<img src="docs/public/assets/gourdy.png" width="96" height="96" alt="Gourdy アイコン">

# Gourdy

日本語を、話しながら入力する。Windows向けのローカル音声入力アプリ。

**日本語文字起こし / リアルタイム入力 / 完全無料（有料機能なし） / ローカル完結**

![Gourdyの録音画面。マイクボタン、音量バー、設定ボタン](docs/public/assets/transcription.png)

[![Version](https://img.shields.io/badge/version-0.7.1-262626)](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.1)
[![Windows](https://img.shields.io/badge/Windows-x64-0078D4)](docs/public/getting-started.md)
[![License](https://img.shields.io/badge/app_license-MIT-4b7152)](LICENSE)
[![Free](https://img.shields.io/badge/有料機能-なし-262626)](#できること)

[ダウンロード](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.1) / [使い方](docs/public/getting-started.md) / [開発ガイド](docs/public/development.md)

</div>

Gourdy（ごーでぃ）は、話している途中から入力欄へ文字を送り、認識結果の変化に合わせて末尾を修正します。
音声認識と日本語解析、AIによる文章補正はPC内で処理します。
APIキーやクラウド文字起こしサービスの契約は不要です。

> **開発中のプレリリースです。セキュリティ対策と監査は万全ではありません。**
> 誤認識や入力先の誤判定が起こることがあります。重要な文章は送信前に確認してください。
> 現時点で機密情報を扱う用途には推奨しません。[セキュリティと保存データの扱い](docs/public/security.md)を確認してください。

## ダウンロード

[バージョン0.7.1のリリースページ](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.1)でZIP版を配布しています。
インストーラーは公開準備中です。
どちらも標準モデルと実行環境を同梱しており、PythonやNode.jsの追加インストールは不要です。

| 配布形式 | ファイル | 起動方法 |
| --- | --- | --- |
| インストーラー版 | 公開準備中 | インストール後、スタートメニューの「Gourdy」から起動 |
| ZIP版 | [gourdy-0.7.1-windows-x64.zip](https://github.com/aToy0m0/gourdy/releases/download/v0.7.1/gourdy-0.7.1-windows-x64.zip) | 全体を展開し、同梱の `Gourdy.exe` を起動 |

対象はWindows x64です。
**Microsoft Visual C++ v14 x64ランタイムが必要です。**
未導入の場合は[導入ガイド](docs/public/getting-started.md)を参照してください。
インストーラーによるランタイムの自動導入は行いません。

配布ファイルは未署名です。
リリースに添付した `SHA256SUMS.txt` でハッシュを照合できます。
更新時は起動中のGourdyをタスクトレイから終了してください。
設定と履歴はAppDataに保存し、インストーラー版とZIP版で共通して使います。

## 最初の音声入力

1. Gourdyを起動し、歯車の「操作」から使用するマイクを選びます。
2. 入力先のテキスト欄をクリックします。
3. **右Ctrlを押して離し**、話し始めます。
4. もう一度右Ctrlを押して離すと録音を停止します。

右Ctrlは初期設定です。
ショートカットは変更でき、更新時も設定を引き継ぎます。
録音画面のマイクボタンでも開始と停止ができます。

入力先からフォーカスが外れると自動入力が止まることがありますが、録音と文字起こしは続きます。
吹き出しに残った文章は、録音と補正の終了後にコピーするか、入力先を選んで「入力」から送れます。
詳しい操作は[導入と使い方](docs/public/getting-started.md)を参照してください。

## できること

| 用途 | 機能 |
| --- | --- |
| 話しながら書く | リアルタイム入力、または結果を確認してから貼り付け |
| 日本語の表記を整える | フィラー、言い直し、句読点を日本語解析とローカルLLMで補正 |
| 固有名詞を登録する | 表記と読みの辞書、辞書ファイルの取り込み、Windows IME形式での書き出し |
| 録音環境を調整する | マイク選択、ノイズ抑制、手動のノイズ閾値、音量表示 |
| 結果を見直す | 履歴のコピーと個別削除、保存録音からの再認識 |
| 会議を文字にする | 最長12時間の音声や動画を読み込み、区間ごとに保存、再試行、再開。プレビューで音声を確認 |
| 音声で操作する | 追加モデルによるキー操作。初期状態は無効で、有効化するとモデルを取得 |
| AIツールからファイルを処理する | ファイル文字起こし専用のMCP接続（開発中）。設定から無効化可能 |

標準モデルによる音声処理は端末内で完結します。
アプリの取得や更新、任意の追加モデルの取得にはネット接続が必要です。
MCP接続は初期状態で同じPCから利用できるよう有効になっています。

## 現在の制約

- 認識精度と処理速度は、音声とPCの性能に左右されます。補正にも誤りが残ります。
- すべてのアプリへのリアルタイム入力は保証していません。
- 会議の話者分離には対応していません。ファイルの再生プレビューは区間単位です。
- 最低メモリ容量は未確定です。モデル読込や補正時を含め、1GB未満の使用量は保証していません。
- クリーンなWindows仮想マシンでの導入試験は未実施です。検証条件は[リリースノート](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.1)に記載しています。

## 開発と技術構成

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![CSharp](https://img.shields.io/badge/C%23-.NET_Framework-512BD4)](https://learn.microsoft.com/dotnet/framework/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Moonshine](https://img.shields.io/badge/ASR-Moonshine_Streaming-262626)](https://github.com/moonshine-ai/moonshine)
[![Qwen](https://img.shields.io/badge/LLM-Qwen3.5_0.8B-262626)](https://huggingface.co/Qwen/Qwen3.5-0.8B)
[![GiNZA](https://img.shields.io/badge/NLP-GiNZA_%2F_Sudachi-262626)](https://github.com/megagonlabs/ginza)

| 処理 | 使用技術 |
| --- | --- |
| 画面とアプリ制御 | Electron、JavaScript |
| Windowsの入力操作 | C#、Windows API |
| ストリーミング音声認識 | Moonshine Small Streaming Japanese |
| 日本語解析 | GiNZA、Sudachi |
| 文章補正 | Qwen3.5-0.8B（Q4_0）、llama.cpp |
| 音声と動画の読込 | FFmpeg |

ソースからのセットアップとビルドは[開発ガイド](docs/public/development.md)にまとめています。
処理の流れは[設計](docs/public/architecture.md)、配布物の作成は[リリース手順](docs/public/release.md)を参照してください。

## ライセンス

Gourdyの独自コードと独自ドキュメントは[MITライセンス](LICENSE)です。
同梱するモデル、推論エンジン、辞書などには、それぞれのライセンスが適用されます。
[第三者ライセンス](docs/public/THIRD-PARTY-NOTICES.md)に各条件を記載し、必要な対応ソースをリリースへ添付しています。
