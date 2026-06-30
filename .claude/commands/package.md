---
description: Package the extension into a .vsix for sideloading
---

Run `bun run package` (wraps `vsce package`). Report the resulting `.vsix` filename and remind the user how to sideload it into VSCodium (`Install from VSIX...` or `codium --install-extension <file>`).
