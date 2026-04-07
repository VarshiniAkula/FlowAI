#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"
exec /opt/homebrew/bin/pnpm --filter @flowmind/web dev "$@"
