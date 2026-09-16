$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Push-Location $PSScriptRoot
try {
    $version = & python -c 'import sys; print(str(sys.version_info.major)+"."+str(sys.version_info.minor))'
    if ($LASTEXITCODE -ne 0 -or $version -ne '3.12') { throw 'セットアップにはPython 3.12が必要です。完成版の実行にはインストール不要です。' }
    & npm.cmd ci --cache .npm-cache
    if ($LASTEXITCODE -ne 0) { throw 'npm ciに失敗しました。' }
    & python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python環境の作成に失敗しました。' }
    & .venv/Scripts/python.exe -m pip install -r requirements.lock.txt --cache-dir .pip-cache
    if ($LASTEXITCODE -ne 0) { throw '日本語解析の依存関係を導入できませんでした。' }
    $manifest = Get-Content runtime-manifest.json -Raw | ConvertFrom-Json
    foreach ($asset in $manifest) {
        if ($asset.folder -notin @('runtime','models') -or $asset.file -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'アセットの保存先が不正です。' }
        New-Item -ItemType Directory -Force $asset.folder | Out-Null
        $destination = Join-Path $asset.folder $asset.file
        if (!(Test-Path -LiteralPath $destination)) {
            $partial = $destination + '.partial'
            Invoke-WebRequest $asset.url -OutFile $partial
            if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $asset.sha256) { throw "取得ファイルのSHA256が一致しません: $($asset.file)" }
            Move-Item -LiteralPath $partial -Destination $destination
        }
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $asset.sha256) { throw "既存ファイルのSHA256が一致しません: $($asset.file)" }
        if ($asset.PSObject.Properties.Name -contains 'extract') {
            if ($asset.extract -notin @('whisper','llama','python')) { throw '展開先が不正です。' }
            Expand-Archive -LiteralPath $destination -DestinationPath (Join-Path runtime $asset.extract) -Force
        }
    }
    $moonshine = Get-Content moonshine-manifest.json -Raw | ConvertFrom-Json
    New-Item -ItemType Directory -Force models/moonshine-small-ja | Out-Null
    foreach ($group in $moonshine.groups) {
        foreach ($asset in $group.files) {
            if ($asset.name -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Invalid model filename' }
            $destination = Join-Path models/moonshine-small-ja $asset.name
            if (!(Test-Path -LiteralPath $destination)) {
                $partial = $destination + '.partial'
                Invoke-WebRequest $asset.url -OutFile $partial
                if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $asset.sha256) { throw 'Moonshine SHA256 mismatch' }
                Move-Item -LiteralPath $partial -Destination $destination
            }
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $asset.sha256) { throw 'Moonshine SHA256 mismatch' }
        }
    }
    & .venv/Scripts/python.exe -m pip install --no-deps --target runtime/moonshine -r requirements-streaming.txt --cache-dir .pip-cache
    if ($LASTEXITCODE -ne 0) { throw 'Moonshine dependency installation failed' }
    New-Item -ItemType Directory -Force runtime/python/Lib | Out-Null
    if (!(Test-Path runtime/python/Lib/site-packages)) { New-Item -ItemType Directory runtime/python/Lib/site-packages | Out-Null }
    Copy-Item .venv/Lib/site-packages/* runtime/python/Lib/site-packages -Recurse -Force
    @('python312.zip','.','Lib/site-packages','import site') | Set-Content runtime/python/python312._pth
    & runtime/python/python.exe -X utf8 -c "import spacy; spacy.load('ja_ginza'); print('日本語解析モデルを確認しました。')"
    if ($LASTEXITCODE -ne 0) { throw '同梱Pythonの検証に失敗しました。' }
    & ./build-native.ps1
    Write-Host '準備が完了しました。npm startで起動、npm run distで同梱版を作成できます。'
} finally { Pop-Location }
