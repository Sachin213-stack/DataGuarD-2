import sys, os, json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'sidecar'))
from analyze import analyze

DATA_DIR = os.path.dirname(os.path.abspath(__file__))

datasets = [
    'clean_employees.csv',
    'messy_healthcare.csv',
    'ecommerce_orders.json',
    'tiny_edge_case.parquet',
]

OUTLIER_PENALTY = 5

def health_score(result):
    total_cols = len(result.get('columns', [])) or (result.get('shape', [0, 1])[1] or 1)
    mp = result.get('missingPercent', {})
    avg_missing = sum(mp.values()) / total_cols
    outlier_penalty = len(result.get('outlierColumns', [])) * OUTLIER_PENALTY
    return max(0, min(100, round(100 - avg_missing * 0.5 - outlier_penalty)))

def color_score(score):
    if score >= 80: return "GREEN"
    if score >= 50: return "YELLOW"
    return "RED"

separator = "=" * 70

for fname in datasets:
    fpath = os.path.join(DATA_DIR, fname)
    print(separator)
    print(f"  DATASET: {fname}")
    print(separator)

    try:
        result = analyze(fpath)
        score = health_score(result)
        color = color_score(score)

        print(f"  Shape:           {result['shape'][0]} rows x {result['shape'][1]} cols")
        print(f"  Health Score:    {score}/100 [{color}]")
        print(f"  Columns:         {', '.join(result['columns'])}")
        print()

        # Missing values
        if result['missingValues']:
            print("  Missing Values:")
            for col, cnt in result['missingValues'].items():
                pct = result['missingPercent'].get(col, 0)
                print(f"    - {col}: {cnt} ({pct}%)")
        else:
            print("  Missing Values: None")
        print()

        # Outliers
        if result['outlierColumns']:
            print(f"  Outlier Columns: {', '.join(result['outlierColumns'])}")
        else:
            print("  Outlier Columns: None")
        print()

        # Class imbalance
        if result['classImbalance']:
            print("  Class Imbalance:")
            for col, counts in result['classImbalance'].items():
                total = sum(counts.values())
                print(f"    - {col}:")
                for val, cnt in counts.items():
                    pct = round(cnt / total * 100, 1)
                    flag = " [IMBALANCED]" if pct > 80 else ""
                    print(f"        {val}: {cnt} ({pct}%){flag}")
        else:
            print("  Class Imbalance: None")
        print()

        # Data types
        print("  Data Types:")
        for col, dtype in result['dtypes'].items():
            print(f"    - {col}: {dtype}")
        print()

        # AI Summary
        print(f"  AI Summary: {result['summary']}")
        print()

    except Exception as e:
        print(f"  ERROR: {e}")
        print()

print(separator)
print("  ALL TESTS COMPLETE")
print(separator)
