$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".venv-package\\Scripts\\python.exe")) {
  & E:\anaconda\python.exe -m venv .venv-package
}

$python = Join-Path $PSScriptRoot ".venv-package\\Scripts\\python.exe"
& $python -m pip install --upgrade pip
& $python -m pip install -r requirements.txt pyinstaller

Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue
& $python -m PyInstaller --clean --noconfirm SignalDeck.spec

$artifactDir = Join-Path $PSScriptRoot "artifacts"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$zipPath = Join-Path $artifactDir "SignalDeck-windows.zip"
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $PSScriptRoot "dist\\SignalDeck\\*") -DestinationPath $zipPath
Write-Host "Windows package created:" $zipPath
