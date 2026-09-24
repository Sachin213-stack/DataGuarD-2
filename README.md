# DataGuard AI 🛡

> AI-powered dataset health analysis for Data Scientists — right inside VS Code & Antigravity.

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://code.visualstudio.com/)
[![Antigravity](https://img.shields.io/badge/Antigravity-Compatible-purple)](https://antigravity.dev/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-yellow)](https://python.org)

## Features

- **🔍 CodeLens Integration** — "View Data Health" button appears above every `pd.read_csv`, `pd.read_parquet`, `pl.read_csv`, and `pd.read_json` call
- **⚡ Auto-Trigger** — Automatically analyzes `.csv`, `.parquet`, and `.json` files when you open them
- **📊 Rich Dashboard** — Interactive webview with:
  - Health score gauge (0–100)
  - Missing values bar chart
  - Data types donut chart
  - Per-column stats table
  - Outlier detection badges
- **🤖 AI Summaries** — Rule-based summaries by default; Gemini AI summaries when API key is configured
- **🚨 Inline Decorations** — Red wavy underlines on data-loading lines when quality issues are detected

## Installation

### Prerequisites

- **VS Code 1.85+** or **Antigravity** (VS Code-compatible)
- Python 3.8+ with pip

### Step 1: Install Python dependencies

```bash
pip install -r sidecar/requirements.txt
```

### Step 2: Build & Package the extension

```bash
npm install
npm run compile
npx @vscode/vsce package
```

### Step 3: Install the `.vsix` extension

**For VS Code:**
```bash
code --install-extension dataguard-ai-0.1.1.vsix
```

**For Antigravity:**
```bash
antigravity --install-extension dataguard-ai-0.1.1.vsix
```

**Or install manually via UI:**
1. Open VS Code / Antigravity
2. Press `Ctrl+Shift+P` → type **"Install from VSIX"**
3. Select the `dataguard-ai-0.1.1.vsix` file
4. Reload the editor when prompted

### Development Mode

Press `F5` to launch the Extension Development Host (works in both VS Code and Antigravity).

## Usage

1. **Open a Python file** containing `pd.read_csv('data.csv')` — a "🔍 View Data Health" CodeLens appears above the line
2. **Click the CodeLens** to analyze the dataset and open the dashboard
3. **Open a `.csv` / `.parquet` / `.json` file** directly — analysis triggers automatically
4. **Command Palette** → `DataGuard: Analyze Dataset Health`
5. **Command Palette** → `DataGuard: Browse & Analyze Any Dataset...` (select any file globally)

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `dataguard.geminiApiKey` | string | `""` | Gemini API key for AI-powered summaries |

Set via settings (`Ctrl+,`) or `settings.json`:

```json
{
  "dataguard.geminiApiKey": "AIza..."
}
```

## Health Score

The health score (0–100) is calculated as:

```
score = 100 - (avg_missing_pct × 0.5) - (outlier_column_count × 5)
```

- 🟢 **80–100**: Healthy dataset
- 🟡 **50–79**: Moderate issues
- 🔴 **0–49**: Critical data quality problems

## Analysis Details

The Python sidecar (`sidecar/analyze.py`) computes:

| Metric | Method | Description |
|--------|--------|-------------|
| Missing Values | `df.isnull().sum()` | Visualizing gaps in dataset entries |
| Outlier Detection | IQR method | Identifying anomalies in data distribution |
| Class Imbalance | Value counts | Highlighting unequal class distributions |
| Data Types | `df.dtypes` | Categorizing information in datasets |
| Data Processing | Pipeline Tracking | Visualizing the flow of data analysis |
| Analysis Techniques | Ensemble Methods | Integrating multiple data evaluation methods |

## Project Structure

```
dataguard-ai/
├── src/
│   ├── extension.ts          # Entry point, event listeners
│   ├── analysisRunner.ts     # Python sidecar spawner (cross-platform)
│   ├── codeLensProvider.ts   # CodeLens above read_* calls
│   ├── decorationProvider.ts # Red underline decorations
│   ├── constants.ts          # Shared patterns & config
│   └── dashboardPanel.ts     # Webview panel manager
├── media/
│   ├── dashboard.html        # Chart.js + Tailwind dashboard
│   └── icon.png              # Extension icon
├── sidecar/
│   ├── analyze.py            # Python analysis engine
│   └── requirements.txt
├── generate_ppt.py           # Auto-generates the project presentation deck
└── package.json
```

## Presentation Deck

You can automatically generate a `.pptx` presentation (complete with speaker notes) summarizing the DataGuard AI project by running:

```bash
python generate_ppt.py
```

## Compatibility

| Editor | Status | Install Command |
|--------|--------|-----------------|
| VS Code | ✅ Fully Supported | `code --install-extension dataguard-ai-0.1.0.vsix` |
| Antigravity | ✅ Fully Supported | `antigravity --install-extension dataguard-ai-0.1.0.vsix` |
| Cursor | ✅ Should work | Install via VSIX UI |
| Other VS Code forks | ✅ Should work | Install via VSIX UI |

## Uninstall

**VS Code:**
```bash
code --uninstall-extension dataguard.dataguard-ai
```

**Antigravity:**
```bash
antigravity --uninstall-extension dataguard.dataguard-ai
```

## License

MIT