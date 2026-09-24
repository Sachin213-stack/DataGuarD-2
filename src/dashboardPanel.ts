import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisResult } from './analysisRunner';
import { HEALTH_SCORE_OUTLIER_PENALTY } from './constants';

export class DashboardPanel {
    static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, result: AnalysisResult) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update(result);
        this._panel.onDidDispose(() => { DashboardPanel.currentPanel = undefined; });
    }

    static createOrShow(extensionUri: vscode.Uri, result: AnalysisResult) {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.Two);
            DashboardPanel.currentPanel._update(result);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'dataguardDashboard',
            'DataGuard Dashboard',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, result);
    }

    private _update(result: AnalysisResult) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'dashboard.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const safeJson = JSON.stringify(result).replace(/</g, '\\u003c');
        html = html.replace('__ANALYSIS_DATA__', () => safeJson);
        html = html.replace('__OUTLIER_PENALTY__', () => String(HEALTH_SCORE_OUTLIER_PENALTY));
        this._panel.webview.html = html;
    }
}
