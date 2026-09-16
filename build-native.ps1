$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw '.NET Framework 4のC#コンパイラが見つかりません。' }
$output = Join-Path $PSScriptRoot 'src\WindowTarget.exe'
$source = Join-Path $PSScriptRoot 'src\WindowTarget.cs'
$wpf = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\WPF'
$liveSource = Join-Path $PSScriptRoot 'src\LiveWriter.cs'
& $compiler /nologo /target:exe /platform:x64 /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll "/reference:$wpf\UIAutomationClient.dll" "/reference:$wpf\UIAutomationTypes.dll" "/reference:$wpf\WindowsBase.dll" "/out:$output" $source $liveSource (Join-Path $PSScriptRoot 'src\CommandWriter.cs') (Join-Path $PSScriptRoot 'src\RealtimeInput.cs')
if ($LASTEXITCODE -ne 0) { throw 'ウィンドウ操作ヘルパーをビルドできませんでした。' }

$imeSource = Join-Path $PSScriptRoot 'src\ImeDictionary.cs'
$imeOutput = Join-Path $PSScriptRoot 'src\ImeDictionary.exe'
& $compiler /nologo /target:exe /platform:x64 /reference:System.Web.Extensions.dll "/out:$imeOutput" $imeSource
if ($LASTEXITCODE -ne 0) { throw 'IME辞書読み取りヘルパーをビルドできませんでした。' }
