# 第三者コンポーネントのライセンス

Gourdy独自部分のMITライセンスは、以下の第三者コード・モデル・辞書の権利を置き換えません。
配布物には上流の著作権表示・ライセンス本文を保持します。個々の著作権者は各本文を参照してください。
各コンポーネントの条件は、同梱する上流のライセンス本文・通知に従います。

## 主な同梱物と別途取得するモデル

| コンポーネント | 用途・版 | 主なライセンス | 配布物内の本文 |
| --- | --- | --- | --- |
| [Lucide](https://github.com/lucide-icons/lucide) | settings / info / x、2026-09-17取得、画面アイコン | ISC、Feather由来のinfo / xはMIT | licenses/LUCIDE-LICENSE.txt |
| [Electron](https://github.com/electron/electron) / Chromium | Electron 44.3.0、デスクトップUI | MITおよび各第三者条件 | LICENSE.electron.txt / LICENSES.chromium.html |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | 2.0.0（server / node / core）、ローカルMCP接続 | MIT | licenses/npm/INDEX.md |
| [ws](https://github.com/websockets/ws) | 8.21.3、BYOK音声接続 | MIT | licenses/npm/ws-8.21.3.txt |
| [CPython](https://www.python.org/) | 3.12.10、埋め込み実行環境 | PSF Licenseおよび同梱第三者条件 | resources/runtime/python/LICENSE.txt |
| [Moonshine Voice](https://github.com/moonshine-ai/moonshine) | 0.1.5、音声認識 | 本体MIT、native依存は別条件 | licenses/moonshine.txt、runtimeのdist-info |
| [Moonshine Streaming](https://github.com/moonshine-ai/moonshine) | Small Streaming Japanese、quantized_26_08_23 | MIT（ストリーミングモデル） | licenses/moonshine.txt |
| [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) / [GGUF](https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF) | Q4_0、文章補正 | Apache-2.0 | licenses/qwen3.txt |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | b10976、CPU推論 | MIT | licenses/llama-cpp.txt |
| LLVM OpenMP | llama.cppの同梱ライブラリ | Apache-2.0 WITH LLVM-exception | resources/runtime/llama/LICENSE-LLVM-OpenMP |
| [GiNZA](https://github.com/megagonlabs/ginza) / ja_ginza | 5.2.1 / 5.2.0、日本語解析（ja_ginzaモデルは0.7.6から別途取得） | MIT、モデル・学習データの表示を同梱 | licenses/release/GiNZA-*、ja_ginza-* |
| [spaCy](https://github.com/explosion/spaCy) | 3.8.16、日本語解析基盤 | MIT | Pythonのdist-info |
| [SudachiPy](https://github.com/WorksApplications/SudachiPy) / [SudachiDict](https://github.com/WorksApplications/SudachiDict) | 0.6.11 / core 20260723 | Apache-2.0、辞書由来データの条件あり | licenses/release/SudachiDict-20260723-LEGAL、SudachiPy-LICENSE |
| [sounddevice](https://github.com/spatialaudio/python-sounddevice) / PortAudio | 0.5.5、音声関連依存 | MIT等 | Moonshineランタイムのdist-info等 |
| [FFmpeg](https://ffmpeg.org/) | 912208af28、Gourdy用共有ビルド | LGPL-2.1-or-later | licenses/ffmpeg、resources/runtime/ffmpeg/LICENSE.txt |

Python依存の正確なバージョンは `requirements.lock.txt` と `requirements-streaming.txt` に記載します。
ビルドに取り込んだPythonパッケージのメタデータと本文は、ランタイム内の `*.dist-info` に保持します。
`licenses/python/` と `licenses/moonshine-dependencies/` にも取得済みの本文を複製します。
certifi 2026.7.22、tqdm 4.70.1の対応ソースを、以下のソース配布物に含めます。
ElectronのChromium第三者表示には、そのバイナリに含まれる依存の通知が含まれます。

## 任意ダウンロード

[Qwen3-4B GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF)（Q4_K_M、Apache-2.0）は音声コマンドまたは上位補正モデルを有効にした場合に取得します。
標準配布ZIPには含めません。Apache-2.0本文は `licenses/qwen3.txt` です。
モデルを交換して再配布する場合は、交換先モデルの条件も確認してください。

## 対応ソースと追加通知

[リリースページ](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.63)に、`gourdy-0.7.63-corresponding-sources.zip` をアプリと同時に掲載します。
上流URLと取得物のSHA256は、その中の `SOURCE-MANIFEST.json` に記録します。

- FFmpeg：コミット `912208af28` の未変更ソース、`build-ffmpeg.sh`、ビルド条件を収録。GPL、nonfree、version3、外部ライブラリの自動検出を無効化し、共有DLLとしてビルドしています。`resources/runtime/ffmpeg/BUILD.txt` に識別情報を記載します。DLLは交換可能です。
- Moonshine：v0.1.5（`234f60faa0eb388b01cdf7e60aca232af37aefda`）のソースを収録。プリビルドバイナリ、モデル、画像、テスト音声を除き、ソースの内容は変更していません。native内のEigen（MPL-2.0）のソースも含みます。
- ONNX Runtime：同梱版1.23.2の第三者通知を `licenses/release/onnxruntime-1.23.2-ThirdPartyNotices.txt` に収録。使用するEigenのコミット `1d8b82b0740839c0de7f1242a3585e3390ff5f33` の対応ソースを別アーカイブで収録します。
- certifi、tqdm：インストール版と一致するsdistを収録します。tqdmはMITとMPL-2.0の適用箇所を持ちます。
- MinGW-w64：FFmpegのCランタイムおよびwinpthreadsに関する通知を `licenses/release/MinGW-w64-COPYRIGHT` に収録します。
- SudachiDict：20260723のLEGAL全文、GiNZAとja_ginzaのREADME・モデル情報、chiVeのライセンスを `licenses/release/` に保持します。
- Moonshine内部のEigen、kaldi-native-fbank、kissfft、nlohmann/json、utf8関連等の通知を `licenses/release/moonshine/` に収録します。
- PortAudioの通知を `licenses/release/PortAudio-LICENSE.txt` に収録します。ASIO版DLLは同梱しません。

FFmpegは別プロセスとして利用します。修正・置換・デバッグを妨げる追加の利用制限を設けません。
対応ソースの提供は [FFmpegの公式配布ガイド](https://www.ffmpeg.org/legal.html) に沿って、バイナリと同じリリースで行います。

MCP SDKを含むnpm実行時依存の固定バージョンは `package-lock.json`、ライセンス一覧と上流の本文は `licenses/npm/INDEX.md` および同フォルダー内に保持します。`node scripts/collect-npm-licenses.cjs` でインストール済みの実行時依存から再生成できます。
