import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

const DOC_MARKER = /@doc:\s*(\S+)/g;
const DEFAULT_DOCS_DIR = "docs";
const DOCLINK_CONFIG_FILE = ".doclink";

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function resolveDocsDir(workspaceRoot: string): string {
  const configPath = path.join(workspaceRoot, DOCLINK_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return DEFAULT_DOCS_DIR;
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (typeof config.docsDir === "string" && config.docsDir.length > 0) {
      return config.docsDir;
    }
  } catch {
    // malformed .doclink — fall back to the default
  }
  return DEFAULT_DOCS_DIR;
}

function resolveTargetPath(uri: vscode.Uri, relPath: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  return workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolveDocsDir(workspaceFolder.uri.fsPath), relPath)
    : path.resolve(path.dirname(uri.fsPath), relPath);
}

const PREVIEW_LINE_LIMIT = 15;

function extractPreview(content: string, anchor?: string): string {
  const lines = content.split("\n");

  if (!anchor) {
    return lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
  }

  const startIndex = lines.findIndex((line) => {
    const heading = line.match(/^(#+)\s+(.*)/);
    return heading !== null && slugify(heading[2]) === anchor;
  });

  if (startIndex === -1) {
    return lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
  }

  const startLevel = lines[startIndex].match(/^#+/)?.[0].length ?? 1;
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const heading = lines[i].match(/^(#+)\s/);
    if (heading && heading[1].length <= startLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, Math.min(endIndex, startIndex + PREVIEW_LINE_LIMIT)).join("\n");
}

function listMarkdownFiles(docsRoot: string): string[] {
  if (!fs.existsSync(docsRoot)) {
    return [];
  }
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(path.relative(docsRoot, fullPath).split(path.sep).join("/"));
      }
    }
  };
  walk(docsRoot);
  return results;
}

class DocLinkCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    let match: RegExpExecArray | null;

    DOC_MARKER.lastIndex = 0;
    while ((match = DOC_MARKER.exec(text))) {
      const target = match[1];
      const startPos = document.positionAt(match.index);
      const range = new vscode.Range(
        startPos.line,
        0,
        startPos.line,
        document.lineAt(startPos.line).text.length,
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "📄 Open doc",
          command: "docLink.open",
          arguments: [document.uri, target],
        }),
      );
    }

    return lenses;
  }
}

class DocLinkCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionList | undefined {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const match = linePrefix.match(/@doc:\s*(\S*)$/);
    if (!match) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    const typed = match[1];
    const range = new vscode.Range(position.translate(0, -typed.length), position);
    const docsDir = resolveDocsDir(workspaceFolder.uri.fsPath);
    const docsRoot = path.join(workspaceFolder.uri.fsPath, docsDir);

    const items = listMarkdownFiles(docsRoot).map((relPath) => {
      const item = new vscode.CompletionItem(relPath, vscode.CompletionItemKind.File);
      item.insertText = relPath;
      item.range = range;
      return item;
    });

    const createItem = new vscode.CompletionItem("➕ Create new doc...", vscode.CompletionItemKind.Event);
    createItem.insertText = "";
    createItem.range = range;
    createItem.filterText = typed;
    createItem.sortText = "~"; // sort after real files
    createItem.command = {
      command: "docLink.createDoc",
      title: "Create new doc",
      arguments: [workspaceFolder.uri.fsPath, docsDir],
    };
    items.push(createItem);

    return new vscode.CompletionList(items, true);
  }
}

class DocLinkHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;
    const markerMatch = /@doc:\s*(\S+)/.exec(line);
    if (!markerMatch) {
      return undefined;
    }

    const matchStart = markerMatch.index;
    const matchEnd = matchStart + markerMatch[0].length;
    if (position.character < matchStart || position.character > matchEnd) {
      return undefined;
    }

    const hoverRange = new vscode.Range(position.line, matchStart, position.line, matchEnd);
    const [relPath, anchor] = markerMatch[1].split("#");
    const resolvedPath = resolveTargetPath(document.uri, relPath);

    if (!fs.existsSync(resolvedPath)) {
      return new vscode.Hover(new vscode.MarkdownString(`Doc Link: no such file \`${relPath}\``), hoverRange);
    }

    const content = fs.readFileSync(resolvedPath, "utf8");
    const preview = extractPreview(content, anchor);

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${relPath}**${anchor ? ` #${anchor}` : ""}\n\n---\n\n`);
    md.appendMarkdown(preview);
    return new vscode.Hover(md, hoverRange);
  }
}

async function createDoc(workspaceRoot: string, docsDir: string): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: "New doc filename (relative to the docs dir)",
    placeHolder: "feature-name.md",
    validateInput: (value) => (value.trim().length === 0 ? "Filename required" : undefined),
  });
  if (!name) {
    return;
  }

  const relPath = name.endsWith(".md") ? name : `${name}.md`;
  const fullPath = path.resolve(workspaceRoot, docsDir, relPath);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const title = path
      .basename(relPath, ".md")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    fs.writeFileSync(fullPath, `# ${title}\n`);
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, relPath);
    });
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
}

async function openDocLink(uri: vscode.Uri, target: string): Promise<void> {
  const [relPath, anchor] = target.split("#");
  const resolvedPath = resolveTargetPath(uri, relPath);

  if (!fs.existsSync(resolvedPath)) {
    vscode.window.showErrorMessage(`Doc Link: no such file "${resolvedPath}"`);
    return;
  }

  const docUri = vscode.Uri.file(resolvedPath);
  const doc = await vscode.workspace.openTextDocument(docUri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false,
  });

  if (!anchor) {
    return;
  }

  const lines = doc.getText().split("\n");
  const headingIndex = lines.findIndex((line) => {
    const heading = line.match(/^#+\s+(.*)/);
    return heading !== null && slugify(heading[1]) === anchor;
  });

  if (headingIndex === -1) {
    return;
  }

  const pos = new vscode.Position(headingIndex, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, new DocLinkCodeLensProvider()),
    vscode.languages.registerCompletionItemProvider(
      { scheme: "file" },
      new DocLinkCompletionItemProvider(),
      ":",
      "/",
      ".",
      "-",
      " ",
    ),
    vscode.languages.registerHoverProvider({ scheme: "file" }, new DocLinkHoverProvider()),
    vscode.commands.registerCommand("docLink.open", openDocLink),
    vscode.commands.registerCommand("docLink.createDoc", createDoc),
  );
}

export function deactivate(): void {}
