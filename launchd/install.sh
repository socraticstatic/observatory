#!/bin/bash
set -eu
PLIST=~/Library/LaunchAgents/com.micahbos.observatory.plist
cp "$(dirname "$0")/com.micahbos.observatory.plist" "$PLIST"
chmod 644 "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Observatory installed and started on http://localhost:3099"
