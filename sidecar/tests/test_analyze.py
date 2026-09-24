"""Tests for sidecar/analyze.py"""
import json
import os
import sys
import tempfile

import numpy as np
import pandas as pd
import pytest

# Make the sidecar package importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from analyze import (
    IMBALANCE_THRESHOLD,
    MAX_UNIQUE_FOR_CATEGORICAL,
    OUTLIER_FRACTION_THRESHOLD,
    analyze,
    detect_outliers_iqr,
    generate_rule_based_summary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_csv(df: pd.DataFrame) -> str:
    """Write *df* to a temporary CSV file and return the path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".csv", delete=False)
    df.to_csv(tmp.name, index=False)
    return tmp.name


def _write_parquet(df: pd.DataFrame) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".parquet", delete=False)
    df.to_parquet(tmp.name, index=False)
    return tmp.name


def _write_json(df: pd.DataFrame) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    df.to_json(tmp.name, orient="records")
    return tmp.name


# ---------------------------------------------------------------------------
# detect_outliers_iqr
# ---------------------------------------------------------------------------

class TestDetectOutliersIqr:
    def test_no_outliers_uniform_data(self):
        series = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
        assert detect_outliers_iqr(series) == 0.0

    def test_returns_positive_fraction_when_outliers_exist(self):
        # Normal cluster plus obvious outliers
        normal = pd.Series(list(range(1, 101)))  # 1–100
        outliers = pd.Series([1000.0, 2000.0])
        series = pd.concat([normal, outliers], ignore_index=True)
        frac = detect_outliers_iqr(series)
        assert frac > 0.0
        assert frac <= 1.0

    def test_zero_iqr_returns_zero(self):
        # All identical values → IQR == 0
        series = pd.Series([5.0] * 50)
        assert detect_outliers_iqr(series) == 0.0

    def test_fraction_is_between_zero_and_one(self):
        series = pd.Series(list(range(20)) + [9999])
        frac = detect_outliers_iqr(series)
        assert 0.0 <= frac <= 1.0

    def test_single_element_no_outliers(self):
        series = pd.Series([42.0])
        # IQR of a single element is 0, so function returns 0.0
        assert detect_outliers_iqr(series) == 0.0

    def test_negative_outliers_detected(self):
        normal = pd.Series(list(range(50, 150)))  # 50–149
        outliers = pd.Series([-9999.0])
        series = pd.concat([normal, outliers], ignore_index=True)
        frac = detect_outliers_iqr(series)
        assert frac > 0.0

    def test_empty_series_returns_zero(self):
        series = pd.Series([], dtype=float)
        assert detect_outliers_iqr(series) == 0.0

    def test_all_nan_series_returns_zero(self):
        series = pd.Series([float("nan"), float("nan")], dtype=float).dropna()
        assert detect_outliers_iqr(series) == 0.0


# ---------------------------------------------------------------------------
# generate_rule_based_summary
# ---------------------------------------------------------------------------

class TestGenerateRuleBasedSummary:
    def _make_result(self, **kwargs) -> dict:
        base = {
            "missingPercent": {},
            "outlierColumns": [],
            "classImbalance": None,
        }
        base.update(kwargs)
        return base

    def test_healthy_dataset_returns_positive_message(self):
        result = self._make_result()
        summary = generate_rule_based_summary(result)
        assert "✅" in summary
        assert "healthy" in summary.lower()

    def test_mentions_worst_missing_column(self):
        result = self._make_result(missingPercent={"age": 5.0, "income": 42.3})
        summary = generate_rule_based_summary(result)
        assert "income" in summary
        assert "42.3%" in summary

    def test_mentions_single_missing_column(self):
        result = self._make_result(missingPercent={"salary": 12.5})
        summary = generate_rule_based_summary(result)
        assert "salary" in summary

    def test_mentions_outlier_columns(self):
        result = self._make_result(outlierColumns=["price", "quantity"])
        summary = generate_rule_based_summary(result)
        assert "price" in summary
        assert "quantity" in summary

    def test_mentions_imbalanced_column(self):
        # 90 vs 10 → 90 % dominant → above IMBALANCE_THRESHOLD
        result = self._make_result(
            classImbalance={"label": {"yes": 90, "no": 10}}
        )
        summary = generate_rule_based_summary(result)
        assert "label" in summary.lower() or "imbalanced" in summary.lower()

    def test_no_warning_for_balanced_class(self):
        # 50/50 split is well below the imbalance threshold
        result = self._make_result(
            classImbalance={"label": {"yes": 50, "no": 50}}
        )
        summary = generate_rule_based_summary(result)
        # Should not warn about imbalance; may still be healthy
        assert "imbalanced" not in summary.lower() or "✅" in summary

    def test_multiple_issues_all_mentioned(self):
        result = self._make_result(
            missingPercent={"col_a": 30.0},
            outlierColumns=["col_b"],
            classImbalance={"col_c": {"x": 95, "y": 5}},
        )
        summary = generate_rule_based_summary(result)
        assert "col_a" in summary
        assert "col_b" in summary

    def test_empty_imbalance_counts_does_not_crash(self):
        result = self._make_result(classImbalance={"col_c": {}})
        summary = generate_rule_based_summary(result)
        assert len(summary) > 0


# ---------------------------------------------------------------------------
# analyze  (integration – writes real temporary files)
# ---------------------------------------------------------------------------

class TestAnalyze:
    def test_analyze_all_nan_column_does_not_crash(self):
        df = pd.DataFrame({"age": [float("nan"), float("nan")], "name": ["A", "B"]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert result["shape"] == [2, 2]
            assert "age" in result["missingValues"]
        finally:
            os.unlink(path)

    def test_analyze_csv_returns_correct_shape(self):
        df = pd.DataFrame({"a": range(50), "b": range(50)})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert result["shape"] == [50, 2]
        finally:
            os.unlink(path)

    def test_analyze_csv_returns_correct_columns(self):
        df = pd.DataFrame({"x": [1, 2], "y": [3, 4], "z": [5, 6]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert set(result["columns"]) == {"x", "y", "z"}
        finally:
            os.unlink(path)

    def test_analyze_parquet(self):
        df = pd.DataFrame({"val": [1.0, 2.0, 3.0]})
        path = _write_parquet(df)
        try:
            result = analyze(path)
            assert result["shape"] == [3, 1]
        finally:
            os.unlink(path)

    def test_analyze_json(self):
        df = pd.DataFrame({"name": ["Alice", "Bob"], "score": [95, 80]})
        path = _write_json(df)
        try:
            result = analyze(path)
            assert result["shape"] == [2, 2]
        finally:
            os.unlink(path)

    def test_unsupported_file_type_raises_value_error(self):
        with pytest.raises(ValueError, match="Unsupported file type"):
            analyze("/tmp/data.txt")

    def test_detects_missing_values(self):
        df = pd.DataFrame({"a": [1.0, None, 3.0, None, 5.0], "b": [1, 2, 3, 4, 5]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert "a" in result["missingValues"]
            assert result["missingValues"]["a"] == 2
            assert "b" not in result["missingValues"]
        finally:
            os.unlink(path)

    def test_missing_percent_calculated_correctly(self):
        df = pd.DataFrame({"a": [None] * 4 + [1.0] * 6})  # 40 % missing
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert "a" in result["missingPercent"]
            assert abs(result["missingPercent"]["a"] - 40.0) < 0.1
        finally:
            os.unlink(path)

    def test_detects_outlier_columns(self):
        # >5 % of values are outliers by IQR definition
        normal = list(range(1, 96))   # 95 values in [1, 95]
        outliers = [10000, 20000, 30000, 40000, 50000, 60000]  # 6 outliers → >5 %
        df = pd.DataFrame({"score": normal + outliers})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert "score" in result["outlierColumns"]
        finally:
            os.unlink(path)

    def test_no_outlier_columns_for_clean_data(self):
        df = pd.DataFrame({"a": list(range(100))})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert "a" not in result["outlierColumns"]
        finally:
            os.unlink(path)

    def test_detects_class_imbalance_for_categorical_column(self):
        # Categorical column with < MAX_UNIQUE_FOR_CATEGORICAL unique values
        df = pd.DataFrame({"label": ["yes"] * 50 + ["no"] * 50})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert result["classImbalance"] is not None
            assert "label" in result["classImbalance"]
        finally:
            os.unlink(path)

    def test_class_imbalance_is_none_when_no_categorical_columns(self):
        df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [4.0, 5.0, 6.0]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert result["classImbalance"] is None
        finally:
            os.unlink(path)

    def test_result_contains_required_keys(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        path = _write_csv(df)
        try:
            result = analyze(path)
        finally:
            os.unlink(path)
        required = {
            "filePath", "shape", "columns", "missingValues",
            "missingPercent", "outlierColumns", "classImbalance",
            "dtypes", "summary",
        }
        assert required.issubset(result.keys())

    def test_dtypes_are_strings(self):
        df = pd.DataFrame({"a": [1, 2], "b": [1.0, 2.0], "c": ["x", "y"]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            for v in result["dtypes"].values():
                assert isinstance(v, str)
        finally:
            os.unlink(path)

    def test_filePath_in_result_matches_input(self):
        df = pd.DataFrame({"x": [1]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert result["filePath"] == path
        finally:
            os.unlink(path)

    def test_summary_is_non_empty_string(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        path = _write_csv(df)
        try:
            result = analyze(path)
            assert isinstance(result["summary"], str)
            assert len(result["summary"]) > 0
        finally:
            os.unlink(path)

    def test_skips_categorical_columns_with_too_many_unique_values(self):
        # More unique values than MAX_UNIQUE_FOR_CATEGORICAL → not included in classImbalance
        values = [f"cat_{i}" for i in range(MAX_UNIQUE_FOR_CATEGORICAL + 5)]
        df = pd.DataFrame({"label": values})
        path = _write_csv(df)
        try:
            result = analyze(path)
            if result["classImbalance"] is not None:
                assert "label" not in result["classImbalance"]
        finally:
            os.unlink(path)
