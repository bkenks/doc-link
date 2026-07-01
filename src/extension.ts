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

async function openDocLink(uri: vscode.Uri, target: string): Promise<void> {
  const [relPath, anchor] = target.split("#");
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const resolvedPath = workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, resolveDocsDir(workspaceFolder.uri.fsPath), relPath)
    : path.resolve(path.dirname(uri.fsPath), relPath);

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
    vscode.commands.registerCommand("docLink.open", openDocLink),
  );
}

export function deactivate(): void {}
