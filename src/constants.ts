export const DATA_LOAD_PATTERNS = [
    /pd\.read_csv\(\s*(?:r|f)?['"](.+?)['"]/,
    /pd\.read_parquet\(\s*(?:r|f)?['"](.+?)['"]/,
    /pl\.read_csv\(\s*(?:r|f)?['"](.+?)['"]/,
    /pl\.read_parquet\(\s*(?:r|f)?['"](.+?)['"]/,
    /pd\.read_json\(\s*(?:r|f)?['"](.+?)['"]/,
] as const satisfies readonly RegExp[];

export function findDataLoadMatch(text: string): RegExpMatchArray | null {
    for (const pattern of DATA_LOAD_PATTERNS) {
        const match = text.match(pattern);
        if (match) { return match; }
    }
    return null;
}

export function testDataLoadPattern(text: string): boolean {
    return DATA_LOAD_PATTERNS.some(p => p.test(text));
}

export const DATA_FILE_EXTENSIONS = ['.csv', '.parquet', '.json'] as const;

export type DataFileExtension = typeof DATA_FILE_EXTENSIONS[number];

export function isDataFile(fileName: string): boolean {
    return DATA_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

export const HEALTH_SCORE_OUTLIER_PENALTY = 5;
