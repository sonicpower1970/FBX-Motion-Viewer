#!/bin/sh
set -eu

# The .app lives beside the existing command, runtime/ and app/ directories.
# Resolve from the executable, not Finder's working directory or a user's path.
PACKAGE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
COMMAND="$PACKAGE_DIR/Start Viewer.command"
if [ ! -f "$COMMAND" ]; then
  /usr/bin/osascript -e 'display alert "FBX Motion Viewer" message "Keep FBX Motion Viewer.app beside Start Viewer.command in the complete extracted release folder. Move the entire folder, not the app alone." as critical'
  exit 1
fi
exec /usr/bin/open -b com.apple.Terminal "$COMMAND"
