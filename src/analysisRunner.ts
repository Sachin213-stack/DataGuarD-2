import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';

function getPythonCommand(): string {
    return os.platform() === 'win32' ? 'python' : 'python3';
}

export interface AnalysisResult {
    filePath: string;
    shape: [number, number];
    columns: string[];
    missingValues: Record<string, number>;
    missingPercent: Record<string, number>;
    outlierColumns: string[];
    classImbalance: Record<string, Record<string, number>> | null;
    dtypes: Record<string, string>;
    dataProcessing: string[];
    analysisTechniques: string[];
    summary: string;
    error?: string;
}

export class AnalysisRunner {
    static run(context: vscode.ExtensionContext, filePath: string): Promise<AnalysisResult> {
        return new Promise((resolve, reject) => {
            const sidecarPath = path.join(context.extensionPath, 'sidecar', 'analyze.py');
            const config = vscode.workspace.getConfiguration('dataguard');
            const apiKey = config.get<string>('geminiApiKey', '');

            const env = { ...process.env, GEMINI_API_KEY: apiKey };
            const proc = cp.spawn(getPythonCommand(), [sidecarPath, filePath], { env });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
            proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
            proc.on('close', (code: number) => {
                if (code !== 0) {
                    let errorMessage = stderr.trim();
                    if (!errorMessage && stdout.trim()) {
                        try {
                            const parsed = JSON.parse(stdout.trim());
                            if (parsed && parsed.error) {
                                errorMessage = parsed.error;
                            }
                        } catch {
                            errorMessage = stdout.trim();
                        }
                    }
                    reject(new Error(errorMessage || `Python exited with code ${code}`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch {
                    reject(new Error(`Failed to parse analysis output: ${stdout}`));
                }
            });
            proc.on('error', (err: Error) => reject(err));
        });
    }
}
