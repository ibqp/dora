
#!/usr/bin/env bash
set -euo pipefail

# Run only from the project containing this script.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json || ! -f Dockerfile ]]; then
  echo "Error: project root not recognized."
  exit 1
fi

MODE="${1:---dry-run}"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply" && "$MODE" != "--deep" ]]; then
  echo "Usage: bash scripts/clean-project.sh [--dry-run|--apply|--deep]"
  exit 1
fi

TARGETS=(
  ".next"
  ".next.nosync"
  "out"
  "coverage"
  "test-results"
  "playwright-report"
  ".turbo"
  ".cache"
  "node_modules/.cache"
  "tsconfig.tsbuildinfo"
)

if [[ "$MODE" == "--deep" ]]; then
  TARGETS+=("node_modules")
fi

echo "DORA Project Cleanup"
echo "Mode: $MODE"
echo "Root: $ROOT"
echo

for target in "${TARGETS[@]}"; do
  if [[ -e "$target" ]]; then
    if [[ "$MODE" == "--dry-run" ]]; then
      echo "[WOULD REMOVE] $target"
    else
      rm -rf -- "$target"
      echo "[REMOVED] $target"
    fi
  fi
done

# Remove common OS metadata and temporary logs.
# Exclude Git internals and installed dependencies.
while IFS= read -r -d '' file; do
  if [[ "$MODE" == "--dry-run" ]]; then
    echo "[WOULD REMOVE] $file"
  else
    rm -f -- "$file"
    echo "[REMOVED] $file"
  fi
done < <(
  find . \
    \( -name .git -o -name node_modules -o -name .next \) -prune -o \
    -type f \( \
      -name ".DS_Store" -o \
      -name "Thumbs.db" -o \
      -name "*.tsbuildinfo" -o \
      -name "npm-debug.log*" -o \
      -name "yarn-debug.log*" -o \
      -name "yarn-error.log*" \
    \) -print0
)

echo
echo "Cleanup finished."
echo "Database, Docker volumes, source code and .env were not touched."