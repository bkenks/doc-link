#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

current_version=$(bun -e "console.log(require('./package.json').version)")

if [ $# -gt 0 ]; then
  new_version="$1"
else
  IFS='.' read -r major minor patch <<< "$current_version"
  new_version="$major.$minor.$((patch + 1))"
fi

if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version: $new_version (expected X.Y.Z)" >&2
  exit 1
fi

tag="v$new_version"
vsix="doc-link-$new_version.vsix"

if gh release view "$tag" >/dev/null 2>&1; then
  echo "Release $tag already exists" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree isn't clean — commit or stash first" >&2
  exit 1
fi

bun -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '$new_version';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "Release $tag"
git push

bun run package

if [ ! -f "$vsix" ]; then
  echo "Expected $vsix after packaging, not found" >&2
  exit 1
fi

gh release create "$tag" "$vsix" \
  --title "$tag" \
  --generate-notes
