#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -x ".venv-package/bin/python3" ]; then
  python3 -m venv .venv-package
fi

.venv-package/bin/python3 -m pip install --upgrade pip
.venv-package/bin/python3 -m pip install -r requirements.txt pyinstaller

rm -rf build dist artifacts
.venv-package/bin/python3 -m PyInstaller --clean --noconfirm SignalDeck.spec

mkdir -p artifacts
ditto -c -k --sequesterRsrc --keepParent "dist/SignalDeck.app" "artifacts/SignalDeck-macos.zip"
echo "macOS package created: artifacts/SignalDeck-macos.zip"
