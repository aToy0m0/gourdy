# 配布とリリース

現在の配布版は **0.7.6（プレリリース）** です。
[GitHub Releases](https://github.com/aToy0m0/gourdy/releases/tag/v0.7.6) でWindows x64用ZIP、インストーラーと対応ソースを配布しています。

## 配布物

- `gourdy-0.7.6-windows-x64-setup.exe`：ユーザー単位のインストーラー。実行環境を同梱し、スタートメニューへ登録。
- `gourdy-0.7.6-windows-x64.zip`：アプリ、依存ランタイム、公開ドキュメント、ライセンス。
- `gourdy-0.7.6-corresponding-sources.zip`：FFmpeg、Moonshine内Eigen、ONNX Runtime用Eigen、certifi、tqdmの対応ソース、FFmpegビルド手順と取得物のハッシュ。
- `SHA256SUMS.txt`：公開済み配布物のSHA256。

ZIP版は全体を展開してGourdy.exeを起動します。Microsoft Visual C++ v14 x64ランタイムが必要です。
追加のコマンドモデルは同梱せず、有効化したときに取得します。

## 作成

```powershell
npm test
npm run test:nlp
npm run dist -- --config.directories.output=dist-staged
npm run release:zip
Expand-Archive release/gourdy-0.7.6-windows-x64.zip -DestinationPath dist-installer-input
npm run dist:installer -- --prepackaged dist-installer-input --config.directories.output=dist-installer
```

別のビルドフォルダーを使う場合は `python scripts/package-release.py --source <フォルダー>` で指定します。
FFmpegは対応ソースZIPを展開し、WSL内のMinGW-w64環境で付属の `build-ffmpeg.sh` を実行します。
使用したツールチェーンと同梱DLLは対応ソースのREADMEとアプリ内のBUILD.txtに記載します。

## 公開時の検査

バージョン一致、アプリの起動、音声認識、ファイル読み込み、ZIP整合性、SHA256、ライセンスと対応ソースの同梱を確認します。
Git追跡対象とZIPに、録音・個人設定・認証トークン・内部メモ・ソースマップを含めません。
タグは検査したソースコミットを指すように作成し、GitHub Releasesにインストーラー・両ZIPとハッシュを添付します。
GitHubが自動生成するGourdyのSource code ZIPは、第三者対応ソースZIPの代わりにはなりません。

## プレリリースの制約

- コード署名はありません。Windowsに保護画面が出る場合があります。
- クリーンなWindows仮想マシンでの導入試験は未実施です。開発PC上の分離した設定で検証しています。
- 第三者による包括的なセキュリティ監査は未実施です。機密情報の利用は推奨しません。
- すべてのアプリへのリアルタイム入力を保証しません。入力先やフォーカスの状態で停止する場合があります。
- 1GB未満のメモリ使用量を保証しません。補正やファイル処理時は使用量が増加します。

個々の検証結果と条件はリリースノートに記載します。ビルド成功だけで動作検証済みとは扱いません。
[第三者表示](THIRD-PARTY-NOTICES.md)と[セキュリティ](security.md)も参照してください。

## 公開範囲

`docs/public/` だけを公開ドキュメントとして追跡・同梱します。
ローカルの調査・作業メモ、録音、モデル、ランタイム、生成物はGit管理から除外します。
バイナリとランタイムはリリースZIPとして提供し、モデルは設定画面から任意取得します。
バージョンは明示的な判断なしに変更しません。


## 検証結果

個別バージョンの変更内容・試験条件・未検証事項はGitHub Releasesに記載します。
モデル重みは同梱しません。実行環境とSudachiの辞書は同梱し、モデル取得はオプトインです。
