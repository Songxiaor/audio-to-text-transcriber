#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$ROOT_DIR/douyin-stepasr-extension"
DIST_DIR="$ROOT_DIR/dist"
SIGNING_DIR="$ROOT_DIR/signing-key"
NAME="audio-to-text-transcriber"
VERSION="$(node -e "console.log(require('$EXT_DIR/manifest.json').version)")"
ZIP_PATH="$DIST_DIR/$NAME-$VERSION.zip"
LATEST_ZIP_PATH="$DIST_DIR/$NAME-latest.zip"
SIGNING_KEY="$SIGNING_DIR/stepaudio-douyin-transcriber.pem"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$DIST_DIR"
mkdir -p "$SIGNING_DIR"
rm -f "$ZIP_PATH"

node -e "JSON.parse(require('fs').readFileSync('$EXT_DIR/manifest.json','utf8')); JSON.parse(require('fs').readFileSync('$EXT_DIR/rules.json','utf8'));"
node "$ROOT_DIR/scripts/verify-release.mjs"

(
  cd "$EXT_DIR"
  zip -qr "$ZIP_PATH" . \
    -x '*.DS_Store' \
    -x '_metadata/*' \
    -x '_metadata/**' \
    -x 'PROGRESS.md' \
    -x 'PUBLISHING.md'
)

echo "ZIP: $ZIP_PATH"
cp "$ZIP_PATH" "$LATEST_ZIP_PATH"
echo "Latest ZIP: $LATEST_ZIP_PATH"

if [[ -x "$CHROME_BIN" ]]; then
  CRX_OUT="$ROOT_DIR/douyin-stepasr-extension.crx"
  PEM_OUT="$ROOT_DIR/douyin-stepasr-extension.pem"
  rm -f "$CRX_OUT"
  if [[ -f "$SIGNING_KEY" ]]; then
    "$CHROME_BIN" --pack-extension="$EXT_DIR" --pack-extension-key="$SIGNING_KEY" >/tmp/stepasr-pack.log 2>&1 || {
      echo "Chrome CRX packing failed. See /tmp/stepasr-pack.log"
      exit 0
    }
  else
    "$CHROME_BIN" --pack-extension="$EXT_DIR" >/tmp/stepasr-pack.log 2>&1 || {
      echo "Chrome CRX packing failed. See /tmp/stepasr-pack.log"
      exit 0
    }
    if [[ -f "$PEM_OUT" ]]; then
      mv "$PEM_OUT" "$SIGNING_KEY"
      chmod 600 "$SIGNING_KEY"
      echo "Created signing key: $SIGNING_KEY"
    fi
  fi
  if [[ -f "$CRX_OUT" ]]; then
    mv "$CRX_OUT" "$DIST_DIR/$NAME-$VERSION.crx"
    cp "$SIGNING_KEY" "$DIST_DIR/$NAME-$VERSION.pem"
    cp "$DIST_DIR/$NAME-$VERSION.crx" "$DIST_DIR/$NAME-latest.crx"
    cp "$SIGNING_KEY" "$DIST_DIR/$NAME-latest.pem"
    chmod 644 "$DIST_DIR/$NAME-$VERSION.crx"
    chmod 644 "$DIST_DIR/$NAME-latest.crx"
    chmod 600 "$DIST_DIR/$NAME-$VERSION.pem"
    chmod 600 "$DIST_DIR/$NAME-latest.pem"
    echo "CRX: $DIST_DIR/$NAME-$VERSION.crx"
    echo "Latest CRX: $DIST_DIR/$NAME-latest.crx"
    echo "PEM: $DIST_DIR/$NAME-$VERSION.pem"
    echo "Signing key: $SIGNING_KEY"
  fi
fi

node "$ROOT_DIR/scripts/verify-release.mjs" --dist
