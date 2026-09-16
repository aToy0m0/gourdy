# 第三者コンポーネントのライセンス

okosy独自部分のMITライセンスは、以下の第三者コード・モデル・辞書の権利を置き換えません。
配布物には上流の著作権表示・ライセンス本文を保持します。個々の著作権者は各本文を参照してください。
この一覧は公開準備中の棚卸しであり、同梱バイナリ全体の配布条件の確認完了を宣言するものではありません。

## 主な同梱物

| コンポーネント | 用途・版 | 主なライセンス | 配布物内の本文 |
| --- | --- | --- | --- |
| [Electron](https://github.com/electron/electron) / Chromium | Electron 44.3.0、デスクトップUI | MITおよび各第三者条件 | LICENSE.electron.txt / LICENSES.chromium.html |
| [CPython](https://www.python.org/) | 3.12.10、埋め込み実行環境 | PSF Licenseおよび同梱第三者条件 | resources/runtime/python/LICENSE.txt |
| [Moonshine Voice](https://github.com/moonshine-ai/moonshine) | 0.1.5、音声認識 | 本体MIT、native依存は別条件 | licenses/moonshine.txt、runtimeのdist-info |
| [Moonshine Streaming](https://github.com/moonshine-ai/moonshine) | Small Streaming Japanese、quantized_26_08_23 | MIT（ストリーミングモデル） | licenses/moonshine.txt |
| [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) / [GGUF](https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF) | Q4_0、文章補正 | Apache-2.0 | licenses/qwen3.txt |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | b10976、CPU推論 | MIT | licenses/llama-cpp.txt |
| LLVM OpenMP | llama.cppの同梱ライブラリ | Apache-2.0 WITH LLVM-exception | resources/runtime/llama/LICENSE-LLVM-OpenMP |
| [GiNZA](https://github.com/megagonlabs/ginza) / ja_ginza | 5.2.1 / 5.2.0、日本語解析 | MIT、モデル・学習データの表示は別途確認対象 | Pythonのdist-infoとモデルのメタデータ |
| [spaCy](https://github.com/explosion/spaCy) | 3.8.16、日本語解析基盤 | MIT | Pythonのdist-info |
| [SudachiPy](https://github.com/WorksApplications/SudachiPy) / [SudachiDict](https://github.com/WorksApplications/SudachiDict) | 0.6.11 / core 20260723 | Apache-2.0、辞書由来データの条件あり | Pythonのdist-info、上流LEGALの補完が必要 |
| [sounddevice](https://github.com/spatialaudio/python-sounddevice) / PortAudio | 0.5.5、音声関連依存 | MIT等 | Moonshineランタイムのdist-info等 |
| [FFmpeg](https://ffmpeg.org/) | N-126574-g912208af28-20260915 | LGPL-3.0系 sharedビルド | licenses/ffmpeg、resources/runtime/ffmpeg/LICENSE.txt |

Python依存の正確なバージョンは `requirements.lock.txt` と `requirements-streaming.txt` に記載します。
ビルドに取り込んだPythonパッケージのメタデータと本文は、ランタイム内の `*.dist-info` に保持します。
`licenses/python/` と `licenses/moonshine-dependencies/` にも取得済みの本文を複製します。
certifiやtqdmなどのMPL対象部分についても、対応ソース提供の確認が必要です。
ElectronのChromium第三者表示には、そのバイナリに含まれる依存の通知が含まれます。

## 任意ダウンロード

[Qwen3-4B GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF)（Q4_K_M、Apache-2.0）は音声コマンドを有効にした場合だけ取得します。
標準配布ZIPには含めません。Apache-2.0本文は `licenses/qwen3.txt` です。
モデルを交換して再配布する場合は、交換先モデルの条件も確認してください。

## FFmpegのビルド情報と対応ソース

- 配布元：[BtbN FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
- 使用ソース：[FFmpeg 912208af28](https://github.com/FFmpeg/FFmpeg/tree/912208af28)
- 元アーカイブ名：ffmpeg-master-latest-win64-lgpl-shared.zip
- 元アーカイブSHA256：`40633DAB97D235F7DE4FF5B8E34E80D778D4E89F97EFB142B081127F3D7C8633`
- 使用状態：変更なし。ffmpeg/ffprobeを外部プロセスとして実行。共有DLLは配布フォルダー内で交換可能。

`latest` の取得先は内容が更新されるため、同じバイナリの再現には上記ハッシュと一致する保存アーカイブが必要です。
ビルドの識別情報は配布物の `resources/runtime/ffmpeg/BUILD.txt` にも保持します。
**対応ソース・依存ソース・正確なビルドスクリプトの提供セットは未整備です。一般公開前に完成させます。**
上流リンクだけで配布義務の履行完了とは扱いません。[FFmpegの公式配布ガイド](https://www.ffmpeg.org/legal.html)を基に確認します。

## 公開前に残る確認

1. FFmpegの上記対応ソースセットを用意し、バイナリと同じ配布場所で提供する。
2. Moonshine native内部のEigen（MPL-2.0）、ONNX Runtime等の通知・対応ソースを取得版に対して照合する。
3. SudachiDictのLEGAL、由来データの表示、ja_ginzaのモデル付随通知を補完する。
4. Python・音声ライブラリの推移的依存とMPL対象の対応ソースを網羅的に照合する。

取得済み本文の同梱と、この未完了一覧の明示は、未充足の配布条件そのものを免除するものではありません。
