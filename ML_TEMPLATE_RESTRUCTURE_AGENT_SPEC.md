# Agent Spec: Restructure This Repository to Match `defhayes/ml-template`

## Purpose

Reorganize the current repository so it follows the machine-learning project layout and conventions recommended by [`defhayes/ml-template`](https://github.com/defhayes/ml-template). This is a repository-structure task, not a rewrite task. Preserve the existing project behavior while moving files into the correct places, introducing configuration boundaries, and keeping generated/heavy artifacts out of Git.

## Source template conventions to follow

The template recommends this conceptual layout:

```text
.
├── pyproject.toml         # Dependency and tool configuration
├── config/                # Centralized hyperparameters and environment configurations
│   └── default.yaml
├── data/                  # Strictly data; excluded from Git
│   ├── raw/               # Immutable source data / original datasets
│   └── processed/         # Canonical features ready for training
├── notebooks/             # Scratchpads and EDA; numbered for execution order
│   ├── 01_eda.ipynb
│   └── 02_prototype.ipynb
├── src/                   # Reusable library code installed in editable mode
│   ├── __init__.py
│   ├── data_loader.py     # Ingestion and pipeline components
│   ├── models.py          # Model definitions / architectures
│   ├── engine.py          # Clean train, validate, and test loops
│   └── utils/             # Monitoring, logging, and evaluation metrics
├── scripts/               # Entry points that invoke src/
│   ├── train.py
│   └── evaluate.py
└── storage/               # Runtime artifacts; excluded from Git
    ├── artifacts/         # Serialized models, scalers, tokenizers
    ├── checkpoints/       # Intermediate training weights
    ├── metrics/           # TensorBoard logs, JSON reports, confusion matrices
    └── mlruns/            # Local MLflow directory generated at runtime
```

Important nuance: the template says runtime-generated directories such as `data/`, `storage/`, and `mlruns/` should not be committed. Create them only when needed locally, and ensure Git ignores them.

## Non-negotiable rules

1. Keep `src/` deterministic and reusable.
   - `src/` contains importable logic: datasets, data loaders, feature transforms, models, metrics, training/evaluation loops, utility functions.
   - Avoid side effects at import time. No argument parsing, no writing files, no starting training, and no implicit network calls during import.

2. Keep `scripts/` as thin execution entry points.
   - Scripts may parse command-line arguments, load `config/default.yaml`, set seeds, resolve paths, call functions/classes from `src/`, and save outputs under `storage/`.
   - Scripts should not contain core model architecture, reusable pipeline logic, or business/domain logic that belongs in `src/`.

3. Decouple configuration from code.
   - Move hardcoded hyperparameters, paths, experiment names, model settings, data settings, training settings, augmentation settings, and tracking settings into `config/default.yaml`.
   - Code should read config values rather than hardcoding experiment parameters.
   - Do not store secrets, credentials, API keys, or private tokens in config files.

4. Keep data and generated artifacts out of Git.
   - `data/` is for local datasets only.
   - `storage/` is for generated artifacts only.
   - Git should ignore `data/`, `storage/`, `mlruns/`, checkpoints, model weights, logs, and cache files.

5. Preserve behavior.
   - This task is primarily structural. Do not change model behavior, training logic, outputs, metrics, or public APIs unless needed to make the structure work.
   - When moving code, update imports and paths carefully.

## Step-by-step implementation instructions

### 1. Inspect the existing repository

Before changing files, inventory the current project:

```bash
git status --short
find . -maxdepth 3 -type f | sort
```

Identify:

- The current Python package/module name.
- Current dependency files: `pyproject.toml`, `requirements.txt`, `setup.py`, `setup.cfg`, `environment.yml`, etc.
- Existing training/evaluation/inference scripts.
- Existing notebooks.
- Existing data directories, model artifacts, checkpoints, logs, metrics, or MLflow runs.
- Hardcoded config values in code.

### 2. Create or normalize the target directories

Create the template directories that make sense for this repository:

```bash
mkdir -p config notebooks scripts src storage/artifacts storage/checkpoints storage/metrics storage/mlruns data/raw data/processed
```

Do not force-commit `data/` or `storage/`. If the repo needs visible placeholder directories, prefer `.gitkeep` files only when `.gitignore` explicitly allows them. Otherwise keep those directories local-only.

### 3. Move reusable code into `src/`

Move reusable code into `src/`. Choose one of these layouts:

#### Option A: Flat template layout

Use this when the repository is small or already matches the template style:

```text
src/
├── __init__.py
├── data_loader.py
├── models.py
├── engine.py
└── utils/
```

#### Option B: Package layout

Use this when the repository already has, or clearly needs, a package name:

```text
src/<package_name>/
├── __init__.py
├── data_loader.py
├── models.py
├── engine.py
└── utils/
```

Prefer Option B for installable projects. Infer `<package_name>` from the repository name, existing imports, or existing package metadata.

Move code according to responsibility:

| Current content | Target location |
|---|---|
| Dataset classes, ingestion, split logic, feature loading | `src/<package_name>/data_loader.py` or `src/<package_name>/data/` |
| Model classes, architectures, heads, wrappers | `src/<package_name>/models.py` or `src/<package_name>/models/` |
| Train/validation/test loops | `src/<package_name>/engine.py` or `src/<package_name>/training/` |
| Metrics, logging helpers, seed helpers, path helpers | `src/<package_name>/utils/` |
| CLI parsing, run orchestration, saving artifacts | `scripts/` |
| Exploratory code | `notebooks/` |

Use `git mv` where possible so history is easier to follow.

### 4. Create thin scripts under `scripts/`

At minimum, create or normalize these entry points if the repository trains/evaluates models:

```text
scripts/train.py
scripts/evaluate.py
```

Each script should:

- Parse `--config`, defaulting to `config/default.yaml`.
- Load YAML config.
- Resolve paths relative to the repository root.
- Set experiment seed if applicable.
- Call reusable functions/classes from `src/`.
- Write generated outputs only under `storage/`.

Example skeleton:

```python
from pathlib import Path
import argparse
import yaml


def load_config(config_path: str | Path) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/default.yaml")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    # Import and call project logic from src/ here.
    # Do not place reusable training/model logic directly in this script.


if __name__ == "__main__":
    main()
```

### 5. Create `config/default.yaml`

Create `config/default.yaml` and move tunable values there. Adapt fields to the actual repository, but use this shape as a baseline:

```yaml
experiment:
  name: "default_experiment"
  seed: 42
  tracking_uri: "file:./storage/mlruns"

data:
  raw_dir: "data/raw"
  processed_dir: "data/processed"
  train_dir: "data/processed/train"
  val_dir: "data/processed/val"
  test_dir: "data/processed/test"
  batch_size: 16
  num_workers: 4

model:
  architecture: "replace_with_model_name"
  pretrained: true

training:
  epochs: 50
  learning_rate: 0.001
  optimizer: "adamw"
  weight_decay: 0.0001
  patience: 10
  mixed_precision: true

augmentation: {}

storage:
  artifacts_dir: "storage/artifacts"
  checkpoints_dir: "storage/checkpoints"
  metrics_dir: "storage/metrics"
```

Keep only meaningful keys. Remove sections that do not apply. Add project-specific keys when needed.

### 6. Configure MLflow/local tracking under `storage/`

If the project uses MLflow, configure it to write locally under `storage/mlruns`:

```bash
export MLFLOW_TRACKING_URI="file:./storage/mlruns"
```

Also make the script read the same value from `config/default.yaml` when possible:

```yaml
experiment:
  tracking_uri: "file:./storage/mlruns"
```

### 7. Update `.gitignore`

Ensure `.gitignore` includes at least:

```gitignore
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
.ipynb_checkpoints/
.env
.venv/
venv/
data/
storage/
mlruns/
*.ckpt
*.pt
*.pth
*.onnx
*.pkl
*.joblib
*.log
```

If placeholders must be committed, use explicit exceptions such as:

```gitignore
data/*
!data/.gitkeep
storage/*
!storage/.gitkeep
```

Only do this if the project intentionally wants placeholder directories in Git.

### 8. Update `pyproject.toml`

Make `pyproject.toml` the source of dependency and tool configuration where possible.

If there is no working `pyproject.toml`, create one. Adapt the name and dependencies to the project:

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "replace-with-project-name"
version = "0.1.0"
description = ""
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
  "pyyaml",
]

[tool.setuptools.packages.find]
where = ["src"]
```

If the project already uses Poetry, Hatch, PDM, uv, or another package manager, preserve that tool’s structure and only adjust it to support the `src/` layout.

### 9. Normalize notebooks

Move notebooks into `notebooks/` and number them by intended order:

```text
notebooks/01_eda.ipynb
notebooks/02_prototype.ipynb
notebooks/03_error_analysis.ipynb
```

Do not leave production-only logic trapped in notebooks. Extract reusable pieces into `src/` and have notebooks import them.

### 10. Normalize generated artifacts

Move generated files out of source directories and into `storage/`:

| Artifact type | Target |
|---|---|
| Trained model weights | `storage/artifacts/` or `storage/checkpoints/` |
| Intermediate checkpoints | `storage/checkpoints/` |
| Evaluation reports | `storage/metrics/` |
| TensorBoard logs | `storage/metrics/` or `storage/tensorboard/` |
| MLflow local runs | `storage/mlruns/` |
| Scalers/tokenizers/encoders | `storage/artifacts/` |

Do not delete user data or generated artifacts. If they were previously tracked, move them carefully, update `.gitignore`, and report what happened.

### 11. Update imports and path handling

After moves:

- Replace relative file-path assumptions with paths derived from the repository root or config.
- Avoid `sys.path.append(...)` hacks when editable install works.
- Make scripts runnable from the repository root.
- Make imports work after:

```bash
python -m pip install -e .
```

### 12. Update README documentation

Update the repository README to describe:

- The new project structure.
- Setup commands.
- How to install dependencies.
- How to prepare data locally.
- How to run training/evaluation.
- Where outputs are written.
- The fact that `data/` and `storage/` are intentionally ignored.

Include a structure block similar to the template’s README, adapted to the actual repository.

## Validation commands

Run the strongest validation that applies to the repository. At minimum:

```bash
python -m pip install -e .
python -m compileall src scripts
```

If tests exist:

```bash
python -m pytest
```

If training/evaluation scripts exist and can run cheaply:

```bash
python scripts/train.py --config config/default.yaml
python scripts/evaluate.py --config config/default.yaml
```

If full training is expensive, add or use a smoke-test config instead:

```bash
python scripts/train.py --config config/smoke.yaml
```

## Acceptance criteria

The restructure is complete only when all of these are true:

- `config/default.yaml` exists and contains the main tunable experiment/data/model/training settings.
- Core reusable code lives under `src/`.
- Executable entry points live under `scripts/` and call into `src/`.
- Notebooks, if present, live under `notebooks/` and are clearly exploratory/prototyping artifacts.
- Data paths are under `data/`, and generated outputs are under `storage/`.
- `data/`, `storage/`, and MLflow runtime output are ignored by Git.
- Imports work after editable install.
- Existing tests or smoke checks pass, or any failures are clearly explained.
- README reflects the new layout and usage.
- The final agent response includes a concise migration summary and any behavior-preserving assumptions made.

## Final response format for the code agent

When finished, respond with:

```markdown
## Repository Restructure Summary

### What changed
- ...

### Files moved
- `old/path.py` → `new/path.py`

### Config introduced
- `config/default.yaml`: ...

### Runtime paths
- Data: `data/`
- Artifacts: `storage/artifacts/`
- Checkpoints: `storage/checkpoints/`
- Metrics: `storage/metrics/`
- MLflow: `storage/mlruns/`

### Validation
- `python -m pip install -e .`: pass/fail/not run
- `python -m compileall src scripts`: pass/fail/not run
- `python -m pytest`: pass/fail/not available

### Notes / assumptions
- ...
```

## Avoid these mistakes

- Do not put production logic in notebooks.
- Do not put core reusable model/training logic in `scripts/`.
- Do not hardcode experiment parameters in Python when they belong in YAML.
- Do not commit datasets, model weights, checkpoints, local metrics, logs, or MLflow runs.
- Do not silently delete data or artifacts.
- Do not break existing public APIs unless unavoidable; document any unavoidable change.
- Do not leave imports depending on the old file layout.
