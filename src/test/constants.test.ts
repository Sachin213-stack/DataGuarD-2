import {
    DATA_LOAD_PATTERNS,
    findDataLoadMatch,
    testDataLoadPattern,
    DATA_FILE_EXTENSIONS,
    isDataFile,
    HEALTH_SCORE_OUTLIER_PENALTY,
} from '../constants';

describe('DATA_LOAD_PATTERNS', () => {
    it('should contain exactly 5 patterns', () => {
        expect(DATA_LOAD_PATTERNS.length).toBe(5);
    });
});

describe('findDataLoadMatch', () => {
    it('matches pd.read_csv with single-quoted path', () => {
        const match = findDataLoadMatch("df = pd.read_csv('data/train.csv')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.csv');
    });

    it('matches pd.read_csv with double-quoted path', () => {
        const match = findDataLoadMatch('df = pd.read_csv("data/train.csv")');
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.csv');
    });

    it('matches pd.read_parquet', () => {
        const match = findDataLoadMatch("df = pd.read_parquet('data/train.parquet')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.parquet');
    });

    it('matches pl.read_csv (Polars)', () => {
        const match = findDataLoadMatch("df = pl.read_csv('data/train.csv')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.csv');
    });

    it('matches pl.read_parquet (Polars)', () => {
        const match = findDataLoadMatch("df = pl.read_parquet('data/train.parquet')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.parquet');
    });

    it('matches pd.read_json', () => {
        const match = findDataLoadMatch("df = pd.read_json('data/train.json')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.json');
    });

    it('returns null for non-matching text', () => {
        expect(findDataLoadMatch("import pandas as pd")).toBeNull();
        expect(findDataLoadMatch("df.to_csv('output.csv')")).toBeNull();
        expect(findDataLoadMatch("")).toBeNull();
    });

    it('returns the first match when multiple patterns could match', () => {
        // pd.read_csv pattern comes first in the array
        const text = "pd.read_csv('a.csv') and pd.read_parquet('b.parquet')";
        const match = findDataLoadMatch(text);
        expect(match).not.toBeNull();
        expect(match![1]).toBe('a.csv');
    });

    it('captures paths with directory separators', () => {
        const match = findDataLoadMatch("pd.read_csv('/home/user/data/my_file.csv')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('/home/user/data/my_file.csv');
    });

    it('captures relative paths with dots and slashes', () => {
        const match = findDataLoadMatch("pd.read_json('../datasets/records.json')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('../datasets/records.json');
    });

    it('matches calls with extra keyword arguments', () => {
        const match = findDataLoadMatch("df = pd.read_csv('data/train.csv', sep=';', index_col=0)");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('data/train.csv');
    });

    it('matches calls with raw string prefix', () => {
        const match = findDataLoadMatch("df = pd.read_csv(r'C:\\data\\train.csv', encoding='utf-8')");
        expect(match).not.toBeNull();
        expect(match![1]).toBe('C:\\data\\train.csv');
    });
});

describe('testDataLoadPattern', () => {
    it('returns true for text containing a data load call', () => {
        expect(testDataLoadPattern("pd.read_csv('file.csv')")).toBe(true);
        expect(testDataLoadPattern("pd.read_parquet('file.parquet')")).toBe(true);
        expect(testDataLoadPattern("pl.read_csv('file.csv')")).toBe(true);
        expect(testDataLoadPattern("pl.read_parquet('file.parquet')")).toBe(true);
        expect(testDataLoadPattern("pd.read_json('file.json')")).toBe(true);
    });

    it('returns false for text without a data load call', () => {
        expect(testDataLoadPattern("import pandas as pd")).toBe(false);
        expect(testDataLoadPattern("df.head()")).toBe(false);
        expect(testDataLoadPattern("")).toBe(false);
    });

    it('returns true when the pattern appears anywhere in the text', () => {
        expect(testDataLoadPattern("x = 1\ndf = pd.read_csv('file.csv')\nprint(df)")).toBe(true);
    });
});

describe('DATA_FILE_EXTENSIONS', () => {
    it('contains .csv, .parquet, and .json', () => {
        expect(DATA_FILE_EXTENSIONS).toContain('.csv');
        expect(DATA_FILE_EXTENSIONS).toContain('.parquet');
        expect(DATA_FILE_EXTENSIONS).toContain('.json');
    });
});

describe('isDataFile', () => {
    it('returns true for .csv files', () => {
        expect(isDataFile('data/train.csv')).toBe(true);
        expect(isDataFile('/absolute/path/file.csv')).toBe(true);
    });

    it('returns true for .parquet files', () => {
        expect(isDataFile('data/train.parquet')).toBe(true);
    });

    it('returns true for .json files', () => {
        expect(isDataFile('data/records.json')).toBe(true);
    });

    it('returns false for other extensions', () => {
        expect(isDataFile('script.py')).toBe(false);
        expect(isDataFile('data/file.txt')).toBe(false);
        expect(isDataFile('model.pkl')).toBe(false);
        expect(isDataFile('notebook.ipynb')).toBe(false);
    });

    it('returns false for a file with no extension', () => {
        expect(isDataFile('Makefile')).toBe(false);
        expect(isDataFile('')).toBe(false);
    });

    it('is case-sensitive (uppercase extension does not match)', () => {
        expect(isDataFile('data/file.CSV')).toBe(false);
        expect(isDataFile('data/file.JSON')).toBe(false);
    });
});

describe('HEALTH_SCORE_OUTLIER_PENALTY', () => {
    it('is a positive number', () => {
        expect(typeof HEALTH_SCORE_OUTLIER_PENALTY).toBe('number');
        expect(HEALTH_SCORE_OUTLIER_PENALTY).toBeGreaterThan(0);
    });

    it('equals 5', () => {
        expect(HEALTH_SCORE_OUTLIER_PENALTY).toBe(5);
    });
});
