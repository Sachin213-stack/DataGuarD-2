import { DecorationProvider } from '../decorationProvider';
import type { AnalysisResult } from '../analysisRunner';

// Build a minimal TextEditor mock
function makeEditor(lines: string[]): any {
    const decorations: any[] = [];
    return {
        _decorations: decorations,
        document: {
            lineCount: lines.length,
            lineAt: (i: number) => ({ text: lines[i], range: { start: { line: i }, end: { line: i } } }),
        },
        setDecorations: jest.fn((_, opts) => { decorations.push(...opts); }),
    };
}

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
    return {
        filePath: 'test.csv',
        shape: [100, 5],
        columns: ['a', 'b', 'c'],
        missingValues: {},
        missingPercent: {},
        outlierColumns: [],
        classImbalance: null,
        dtypes: {},
        dataProcessing: [],
        analysisTechniques: [],
        summary: '',
        ...overrides,
    };
}

describe('DecorationProvider.applyDecorations', () => {
    it('does nothing when editor is undefined', () => {
        // Should not throw
        expect(() => DecorationProvider.applyDecorations(undefined, makeResult())).not.toThrow();
    });

    it('clears decorations when there are no issues', () => {
        const editor = makeEditor(["df = pd.read_csv('file.csv')"]);
        const result = makeResult(); // no issues
        DecorationProvider.applyDecorations(editor, result);
        expect(editor.setDecorations).toHaveBeenCalledTimes(1);
        const [, opts] = editor.setDecorations.mock.calls[0];
        expect(opts).toEqual([]);
    });

    it('applies a decoration to a line with a data-load call when missingValues has entries', () => {
        const editor = makeEditor([
            'import pandas as pd',
            "df = pd.read_csv('file.csv')",
            'print(df)',
        ]);
        const result = makeResult({ missingValues: { col_a: 10 } });
        DecorationProvider.applyDecorations(editor, result);
        expect(editor.setDecorations).toHaveBeenCalledTimes(1);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(1);
        // The decorated range should be the data-load line (line 1)
        expect(decorationOpts[0].range.start.line).toBe(1);
    });

    it('applies decorations when outlierColumns is non-empty', () => {
        const editor = makeEditor(["df = pd.read_csv('file.csv')"]);
        const result = makeResult({ outlierColumns: ['age'] });
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(1);
    });

    it('applies decorations when classImbalance is heavily imbalanced (>80%)', () => {
        const editor = makeEditor(["df = pd.read_csv('file.csv')"]);
        const result = makeResult({ classImbalance: { label: { yes: 90, no: 10 } } });
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(1);
    });

    it('does not apply decorations when classes are balanced (e.g. 50/50)', () => {
        const editor = makeEditor(["df = pd.read_csv('file.csv')"]);
        const result = makeResult({ classImbalance: { label: { yes: 50, no: 50 } } });
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(0);
    });

    it('does not decorate lines that do not contain a data-load pattern', () => {
        const editor = makeEditor([
            'import pandas as pd',
            'x = 1',
            'print(x)',
        ]);
        const result = makeResult({ outlierColumns: ['col'] });
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(0);
    });

    it('decorates all matching lines when multiple data-load calls are present', () => {
        const editor = makeEditor([
            "df1 = pd.read_csv('a.csv')",
            'x = 1',
            "df2 = pd.read_parquet('b.parquet')",
        ]);
        const result = makeResult({ missingValues: { col: 5 } });
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toHaveLength(2);
    });

    it('clears decorations even if the document has no data-load lines when there are no issues', () => {
        const editor = makeEditor(['x = 1', 'print(x)']);
        const result = makeResult();
        DecorationProvider.applyDecorations(editor, result);
        const [, decorationOpts] = editor.setDecorations.mock.calls[0];
        expect(decorationOpts).toEqual([]);
    });
});
