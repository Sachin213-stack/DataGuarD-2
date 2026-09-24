#!/usr/bin/env python3
import sys
import json
import os
import numpy as np
import pandas as pd

OUTLIER_FRACTION_THRESHOLD = 0.05
MAX_UNIQUE_FOR_CATEGORICAL = 10
IMBALANCE_THRESHOLD = 0.8

def detect_outliers_iqr(series: pd.Series) -> float:
    """Return fraction of outliers using IQR method."""
    if len(series) == 0:
        return 0.0
    Q1 = series.quantile(0.25)
    Q3 = series.quantile(0.75)
    IQR = Q3 - Q1
    if IQR == 0 or np.isnan(IQR):
        return 0.0
    outliers = ((series < Q1 - 1.5 * IQR) | (series > Q3 + 1.5 * IQR)).sum()
    return float(outliers) / len(series)

def generate_rule_based_summary(result: dict) -> str:
    lines = []
    if result['missingPercent']:
        worst = max(result['missingPercent'], key=result['missingPercent'].get)
        pct = result['missingPercent'][worst]
        lines.append(f"⚠ Column '{worst}' has {pct:.1f}% missing values — consider imputation or removal.")
    if result['outlierColumns']:
        lines.append(f"⚠ Outliers detected in: {', '.join(result['outlierColumns'])}. Consider capping or log-transformation.")
    if result['classImbalance']:
        for col, counts in result['classImbalance'].items():
            values = list(counts.values())
            if not values:
                continue
            if max(values) / (sum(values) + 1e-9) > IMBALANCE_THRESHOLD:  # epsilon guards against unexpected empty counts
                lines.append(f"⚠ Column '{col}' is heavily imbalanced. Consider resampling techniques.")
    if not lines:
        lines.append("✅ No critical data quality issues detected. Your dataset looks healthy!")
    return ' '.join(lines)

def generate_ai_summary(result: dict) -> str:
    api_key = os.environ.get('GEMINI_API_KEY', '')
    if not api_key:
        return generate_rule_based_summary(result)
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        stats_text = json.dumps({
            'shape': result['shape'],
            'missingPercent': result['missingPercent'],
            'outlierColumns': result['outlierColumns'],
            'classImbalance': result['classImbalance'],
        }, indent=2)
        prompt = (
            "You are a data quality expert. Given these dataset statistics, provide concise, "
            "actionable advice in 2-3 sentences for a Data Scientist:\n\n" + stats_text
        )
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return generate_rule_based_summary(result) + f" (AI unavailable: {e})"

def analyze(file_path: str) -> dict:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(file_path)
    elif ext == '.parquet':
        df = pd.read_parquet(file_path)
    elif ext == '.json':
        df = pd.read_json(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    missing = df.isnull().sum()
    missing_values = {col: int(cnt) for col, cnt in missing.items() if cnt > 0}
    missing_percent = {col: round(float(cnt) / len(df) * 100, 2) for col, cnt in missing.items() if cnt > 0} if len(df) > 0 else {}

    outlier_columns = []
    for col in df.select_dtypes(include=[np.number]).columns:
        frac = detect_outliers_iqr(df[col].dropna())
        if frac > OUTLIER_FRACTION_THRESHOLD:
            outlier_columns.append(col)

    class_imbalance = {}
    for col in df.select_dtypes(include=['object', 'category', 'str', 'bool']).columns:
        if df[col].nunique() < MAX_UNIQUE_FOR_CATEGORICAL:
            counts = df[col].value_counts().to_dict()
            class_imbalance[col] = {str(k): int(v) for k, v in counts.items()}

    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}

    has_actual_imbalance = False
    if class_imbalance:
        for counts in class_imbalance.values():
            vals = list(counts.values())
            if vals and (max(vals) / (sum(vals) + 1e-9) > IMBALANCE_THRESHOLD):
                has_actual_imbalance = True
                break

    data_processing = ["Dataset Loaded", "Schema Inferred"]
    if missing_values:
        data_processing.append("Missing Values Detected (Imputation Recommended)")
    if outlier_columns:
        data_processing.append("Outliers Flagged (Capping Recommended)")
    if has_actual_imbalance:
        data_processing.append("Class Imbalance Detected (Resampling Recommended)")
    data_processing.append("Analysis Complete")

    analysis_techniques = [
        "Null Value Profiling",
        "IQR Outlier Detection",
        "Categorical Distribution Analysis",
        "Type Inference",
    ]

    result = {
        'filePath': file_path,
        'shape': list(df.shape),
        'columns': list(df.columns),
        'missingValues': missing_values,
        'missingPercent': missing_percent,
        'outlierColumns': outlier_columns,
        'classImbalance': class_imbalance if class_imbalance else None,
        'dtypes': dtypes,
        'dataProcessing': data_processing,
        'analysisTechniques': analysis_techniques,
        'summary': '',
    }
    result['summary'] = generate_ai_summary(result)
    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file path provided'}))
        sys.exit(1)
    try:
        output = analyze(sys.argv[1])
        print(json.dumps(output))
    except Exception as e:
        sys.stderr.write(f"{str(e)}\n")
        print(json.dumps({'error': str(e), 'filePath': sys.argv[1]}))
        sys.exit(1)
