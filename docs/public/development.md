# 開発ガイド

## 必要な環境

- Windows x64、Git、Node.js 22以降とnpm、Python 3.12。
- Windowsの.NET Framework 4 C#コンパイラ（`build-native.ps1` が場所を検査）。
- 初回の依存・モデル取得用ネット接続と数GB以上の空き領域。ビルド時には配布フォルダーとZIPの分も必要です。

## セットアップ

リポジトリを取得したフォルダーで実行します。

```powershell
.\setup.ps1
npm start
```

setupはnpm依存、Python依存、llama.cpp、埋め込みPython、Moonshineモデル、補正モデルを準備します。
取得先とSHA256は `runtime-manifest.json` と `moonshine-manifest.json` で管理します。
Python依存はバージョン固定ですが、wheelのハッシュ固定は未対応です。

**FFmpegは別途準備が必要です。** `runtime/ffmpeg/` にLGPL sharedビルドのffmpeg.exe、ffprobe.exe、共有DLL、LICENSE.txt、BUILD.txtを置きます。
Gourdy 0.7.1ではFFmpeg 912208af28を `scripts/build-ffmpeg.sh` でビルドします（WSL内でMinGW-w64、nasm、make、pkg-configが必要）。ビルド先の `gourdy/ffmpeg/bin` からexeとDLLを配置し、MinGWのlibwinpthread-1.dllと通知も同梱します。
使用中ビルドと必要な対応ソースは [第三者表示](THIRD-PARTY-NOTICES.md) を参照してください。
FFmpegを準備するまでは会議ファイルの読み込み・音声プレビューを検証できません。
異なるビルドへ変更するときは、ライセンス・依存・SHA256を改めて確認してください。

## テストとビルド

```powershell
npm test
npm run test:nlp
npm run dist -- --config.directories.output=dist-staged
npm run release:zip
```

Nodeのテストは辞書・履歴・補正・再開処理・入力プロトコルなどの自動検証です。
実アプリへの入力、音声の認識精度、実マイクは別途手動検証が必要です。
メモ帳、ブラウザーのinput/textarea/contenteditable、Web版ChatGPT、Codexの入力欄で、追記・末尾修正・停止・入力先移動を確認します。テスト文は送信しません。
`DICTATION_TEST_DATA` に専用フォルダーを設定するとユーザーデータを隔離できます。通常プロファイルをテストで書き換えないでください。

## 構成と変更ルール

- `src/`：Electron画面・制御、C#入力ヘルパー、Python音声認識・日本語解析。
- `test/`：自動テスト。
- `docs/public/`：公開ドキュメント。内部メモ・録音・実行ログはGitにも配布物にも含めません。
- `licenses/`：第三者のライセンス本文。
- `scripts/package-release.py`：ビルド済みフォルダーのZIP化とSHA256生成。

現在のバージョンは **0.7.1** です。バージョン変更は明示的なリリース判断で行い、作業のたびに自動でマイナーバージョンを上げません。
package.jsonとpackage-lock.json、READMEと配布案内を同時に更新します。
入力の安全確認を失敗時に黙って省略しないこと、無関係なモデル変更や抽象化を混ぜないことを原則とします。

### アプリアイコン

`src/assets/gourdy.svg` が原稿です。`npm run build:icons` でPNGとWindows用の複数解像度ICO、README用の画像を生成します。Electronの非表示レンダラーを使うため、Windowsデスクトップで実行してください。生成物もリポジトリで管理します。実行ファイルのアイコン埋め込みを有効にし、コード署名のみ無効にしています。

## インストーラー

Windows用NSISインストーラーは、検証済みの配布ZIPを新しいフォルダーへ展開し、その内容から生成できます。起動テスト後のフォルダーはPythonキャッシュが増えるため、そのまま再包装しないでください。

```powershell
npm run dist:installer -- --prepackaged dist-staged/win-unpacked --config.directories.output=dist-installer
```

`package.json`の`build.nsis`でユーザー単位・保存データ保持・スタートメニュー登録を設定しています。
インストール中はGourdyを終了してください。インストーラーによるVisual C++ランタイムの追加導入や自動更新は行いません。
