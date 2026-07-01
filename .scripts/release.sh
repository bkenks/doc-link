#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(bun -e "console.log(require('./package.json').version)")
tag="v$version"
vsix="doc-link-$version.vsix"

if gh release view "$tag" >/dev/null 2>&1; then
  echo "Release $tag already exists" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree isn't clean — commit or stash first" >&2
  exit 1
fi

bun run package

if [ ! -f "$vsix" ]; then
  echo "Expected $vsix after packaging, not found" >&2
  exit 1
fi

gh release create "$tag" "$vsix" \
  --title "$tag" \
  --generate-notes
