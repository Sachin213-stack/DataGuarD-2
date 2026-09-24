import * as vscode from 'vscode';
import { AnalysisResult } from './analysisRunner';
import { testDataLoadPattern } from './constants';

const warningDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline wavy red',
    after: {
        contentText: ' ⚠ Data Quality Issues Detected',
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic'
    }
});

export class DecorationProvider {
    static hasQualityIssues(result: AnalysisResult): boolean {
        if (Object.keys(result.missingValues || {}).length > 0) {
            return true;
        }
        if ((result.outlierColumns || []).length > 0) {
            return true;
        }
        if (result.classImbalance) {
            for (const counts of Object.values(result.classImbalance)) {
                const values = Object.values(counts);
                if (values.length === 0) { continue; }
                const total = values.reduce((a, b) => a + b, 0);
                if (total > 0 && Math.max(...values) / total > 0.8) {
                    return true;
                }
            }
        }
        return false;
    }

    static applyDecorations(editor: vscode.TextEditor | undefined, result: AnalysisResult) {
        if (!editor) { return; }
        const hasIssues = DecorationProvider.hasQualityIssues(result);
        if (!hasIssues) {
            editor.setDecorations(warningDecoration, []);
            return;
        }
        const decorations: vscode.DecorationOptions[] = [];
        for (let i = 0; i < editor.document.lineCount; i++) {
            const line = editor.document.lineAt(i);
            if (testDataLoadPattern(line.text)) {
                decorations.push({ range: line.range });
            }
        }
        editor.setDecorations(warningDecoration, decorations);
    }
}
