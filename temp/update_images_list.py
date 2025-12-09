from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List


def list_png_filenames(dataset_dir: Path) -> List[str]:
    if not dataset_dir.is_dir():
        raise ValueError(f"Dataset directory does not exist: {dataset_dir}")

    png_files = [
        entry.name
        for entry in dataset_dir.iterdir()
        if entry.is_file() and entry.suffix.lower() == ".png"
    ]
    return sorted(png_files)


def write_images_list_json(output_path: Path, filenames: Iterable[str]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(list(filenames)), encoding="utf-8")


def main() -> None:
    dataset_dir = Path("public") / "dataset_all"
    output_path = Path("app") / "data" / "images_list.json"

    filenames = list_png_filenames(dataset_dir)
    write_images_list_json(output_path, filenames)
    print(f"Wrote {len(filenames)} entries to {output_path}")


if __name__ == "__main__":
    main()

