# doc-link

Click a `@doc:` marker in any code comment to open the linked markdown doc in a side panel — editable, git-tracked, no external service.

## The convention

Drop a marker in any comment, in any language:

```js
// @doc: auth.md#token-refresh
function refreshToken() { ... }
```

The path is resolved relative to a `docs/` folder at the root of your workspace — not relative to the file the comment lives in. So `auth.md` above means `<workspace-root>/docs/auth.md`, regardless of where `refreshToken` is defined.

A "📄 Open doc" CodeLens appears above the line. Click it and the target markdown file opens beside your code, editable. If you add a `#slug` anchor, it jumps to and selects the matching `## Heading` in that file (slugified the same way GitHub does: lowercased, punctuation stripped, spaces → hyphens).

The marker is just a relative path in a plain comment, so it's tracked by git like everything else — no database, no service, no sync step.

## Configuring the docs directory

If your docs don't live in `docs/`, drop a `.doclink` file at the workspace root:

```json
{
  "docsDir": "documentation"
}
```

`@doc:` paths then resolve relative to `<workspace-root>/documentation` instead. No `.doclink` file, or a missing/invalid `docsDir` key, falls back to `docs/`.

## Autocomplete

Type `@doc:` and a suggestion list pops up with every `.md` file found in the docs dir (recursively), plus an **➕ Create new doc...** entry. Picking a file inserts its path. Picking "Create new doc" prompts for a filename, creates a stub file (`# Title`) in the docs dir, inserts its path at the cursor, and opens the new file beside your code so you can start writing immediately.

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- VS Code or VSCodium ≥ 1.85

## Develop

```sh
bun install
bun run watch
```

Then press `F5` (Run Extension) to launch an Extension Development Host with the extension loaded.

## Package and install into VSCodium

This isn't published to a marketplace — package it to a `.vsix` and sideload it:

```sh
bun run package
```

This produces `doc-link-0.1.0.vsix`. In VSCodium: open the Extensions view → `...` menu → **Install from VSIX...** → select the file. Or from the CLI:

```sh
codium --install-extension doc-link-0.1.0.vsix
```
