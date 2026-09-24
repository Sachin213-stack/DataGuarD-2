import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DataGuardCodeLensProvider } from './codeLensProvider';
import { AnalysisRunner } from './analysisRunner';
import { DashboardPanel } from './dashboardPanel';
import { DecorationProvider } from './decorationProvider';
import { findDataLoadMatch, isDataFile, DATA_FILE_EXTENSIONS } from './constants';

const DEBOUNCE_MS = 1500;

const IGNORED_JSON_NAMES = new Set([
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'launch.json',
    'tasks.json',
    'settings.json',
    'extensions.json',
    'compile_commands.json'
]);

class DataGuardSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
    getChildren(): vscode.TreeItem[] {
        const item1 = new vscode.TreeItem('Analyze Current Dataset', vscode.TreeItemCollapsibleState.None);
        item1.iconPath = new vscode.ThemeIcon('play');
        item1.command = { command: 'dataguard.analyzeDataset', title: 'Analyze Current Dataset' };

        const item2 = new vscode.TreeItem('Browse & Analyze Any Dataset...', vscode.TreeItemCollapsibleState.None);
        item2.iconPath = new vscode.ThemeIcon('file-submodule');
        item2.command = { command: 'dataguard.browseAndAnalyze', title: 'Browse & Analyze Any Dataset...' };

        return [item1, item2];
    }
}

export function activate(context: vscode.ExtensionContext) {
    // ---------- Register Activity Bar View ----------
    const sidebarProvider = new DataGuardSidebarProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('dataguardView', sidebarProvider)
    );

    // ---------- CodeLens (still Python-only) ----------
    const codeLensProvider = new DataGuardCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'python' }, codeLensProvider)
    );

    // ---------- Core analysis command ----------
    const analyzeCommand = vscode.commands.registerCommand('dataguard.analyzeDataset', async (filePath?: string) => {
        const targetPath = filePath || getActiveDataFilePath();
        if (!targetPath) {
            vscode.window.showWarningMessage('DataGuard: No dataset file found to analyze.');
            return;
        }

        // Resolve relative paths against the workspace *or* cwd
        const resolvedPath = resolveFilePath(targetPath);

        vscode.window.showInformationMessage(`DataGuard: Analyzing ${resolvedPath}...`);
        try {
            const results = await AnalysisRunner.run(context, resolvedPath);
            DashboardPanel.createOrShow(context.extensionUri, results);
            DecorationProvider.applyDecorations(vscode.window.activeTextEditor, results);
        } catch (err: any) {
            vscode.window.showErrorMessage(`DataGuard Analysis Failed: ${err.message}`);
        }
    });
    context.subscriptions.push(analyzeCommand);

    // ---------- Browse & Analyze — works from ANYWHERE ----------
    const browseCommand = vscode.commands.registerCommand('dataguard.browseAndAnalyze', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Analyze Dataset',
            filters: {
                'Data Files': ['csv', 'parquet', 'json'],
                'All Files': ['*']
            }
        });
        if (uris && uris.length > 0) {
            await vscode.commands.executeCommand('dataguard.analyzeDataset', uris[0].fsPath);
        }
    });
    context.subscriptions.push(browseCommand);

    // ---------- Auto-analyze when ANY data file is opened (global, not workspace-only) ----------
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (isDataFile(doc.fileName)) {
                vscode.commands.executeCommand('dataguard.analyzeDataset', doc.fileName);
            }
        })
    );

    // ---------- Watch for data-load statements in Python files ----------
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'python') { return; }
            const hasRead = event.contentChanges.some(c => c.text.includes('read_'));
            const docAny = event.document as any;
            if (!hasRead && !docAny.__dataguardTimer) { return; }

            // Debounce: reset timer on every keystroke once read_ has been typed
            if (docAny.__dataguardTimer) {
                clearTimeout(docAny.__dataguardTimer);
            }
            docAny.__dataguardTimer = setTimeout(() => {
                delete docAny.__dataguardTimer;
                for (const change of event.contentChanges) {
                    if (change.range.start.line < event.document.lineCount) {
                        const line = event.document.lineAt(change.range.start.line);
                        const lineMatch = findDataLoadMatch(line.text);
                        if (lineMatch) {
                            vscode.commands.executeCommand('dataguard.analyzeDataset', lineMatch[1]);
                            return;
                        }
                    }
                }
                const match = findDataLoadMatch(event.document.getText());
                if (match) {
                    vscode.commands.executeCommand('dataguard.analyzeDataset', match[1]);
                }
            }, DEBOUNCE_MS);
        })
    );

    // ---------- Watch file system for new CSV/Parquet/JSON files created ANYWHERE ----------
    const globalWatcher = vscode.workspace.createFileSystemWatcher('**/*.{csv,parquet,json}');
    globalWatcher.onDidCreate(uri => {
        const lowerPath = uri.fsPath.toLowerCase();
        const baseName = path.basename(uri.fsPath).toLowerCase();
        if (
            lowerPath.includes(`${path.sep}node_modules${path.sep}`) ||
            lowerPath.includes(`${path.sep}.git${path.sep}`) ||
            lowerPath.includes(`${path.sep}.vscode${path.sep}`) ||
            IGNORED_JSON_NAMES.has(baseName)
        ) {
            return;
        }

        const config = vscode.workspace.getConfiguration('dataguard');
        const autoAnalyze = config.get<boolean>('autoAnalyzeOnCreate', true);
        if (autoAnalyze) {
            vscode.window.showInformationMessage(
                `DataGuard: New data file detected — ${path.basename(uri.fsPath)}`,
                'Analyze Now',
                'Dismiss'
            ).then(choice => {
                if (choice === 'Analyze Now') {
                    vscode.commands.executeCommand('dataguard.analyzeDataset', uri.fsPath);
                }
            });
        }
    });
    context.subscriptions.push(globalWatcher);

    console.log('DataGuard AI activated — global analysis enabled for all data files.');
}

/**
 * Resolve a file path that may be relative to the active document, workspace, or an absolute path.
 */
function resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    // Try resolving relative to the active document directory first
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc && activeDoc.fileName) {
        const candidateFromDoc = path.join(path.dirname(activeDoc.fileName), filePath);
        if (fs.existsSync(candidateFromDoc)) {
            return candidateFromDoc;
        }
    }
    // Try workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        for (const folder of workspaceFolders) {
            const candidate = path.join(folder.uri.fsPath, filePath);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return path.join(workspaceFolders[0].uri.fsPath, filePath);
    }
    // Fall back to cwd
    return path.resolve(filePath);
}

/**
 * Return the active editor's file path ONLY if it is a supported data file.
 * Otherwise return undefined so the caller can prompt the user.
 */
function getActiveDataFilePath(): string | undefined {
    const fileName = vscode.window.activeTextEditor?.document.fileName;
    if (fileName && isDataFile(fileName)) {
        return fileName;
    }
    return undefined;
}

export function deactivate() {}

