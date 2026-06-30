# doc-link

Click a `@doc:` marker in any code comment to open the linked markdown doc in a side panel — editable, git-tracked, no external service.

Local path: `~/ghq/github.com/bkenks/doc-link`

## Stack

- Runtime/tooling: Bun (package manager, build scripts)
- Target: VS Code / VSCodium extension host (CommonJS, not a Bun app)
- Language: TypeScript (strict)

## Layout

- `src/extension.ts` — activation, `DocLinkCodeLensProvider`, `docLink.open` command
- `package.json` — extension manifest (`contributes`, `engines.vscode`) + scripts
- `tsconfig.json` — CommonJS output to `dist/`, required by the extension host
- `.vscode/launch.json` + `.vscode/tasks.json` — F5 Extension Development Host
- `.vscodeignore` — controls what `vsce package` includes in the `.vsix`

## Build / test / package

```sh
bun install         # install deps
bun run compile      # tsc -p ./
bun run watch        # tsc -p ./ -w
bun run package       # vsce package -> doc-link-<version>.vsix
```

No automated tests yet — verify by pressing F5 and opening a file with a `@doc:` marker in the Extension Development Host.

## Conventions

- Prefer `bun` over `node`/`npm`, `bunx` over `npx`.
- Extension code must stay CommonJS-compatible (`module: commonjs` in tsconfig) — the VS Code extension host does not load ESM extensions reliably across versions.
- All disposables (commands, providers) go through `context.subscriptions.push(...)` in `activate`.
- No `any` without a justifying comment.
