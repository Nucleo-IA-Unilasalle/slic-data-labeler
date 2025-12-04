"""
Script to download wound segmentation images from Kaggle using kagglehub
and filter images starting with 'wsnet' or 'medetec' from train and test sets.
"""
import os
import shutil
import json
from pathlib import Path

import kagglehub


def main() -> None:
    project_root = Path(__file__).parent.parent
    target_dir = project_root / "public" / "images_fuseg"
    images_list_path = project_root / "app" / "data" / "images_list.json"
    
    # Download dataset using kagglehub
    print("Downloading dataset from Kaggle...")
    dataset_path = kagglehub.dataset_download("leoscode/wound-segmentation-images")
    print(f"Dataset downloaded to: {dataset_path}")
    
    dataset_path = Path(dataset_path)
    
    # Find all image files that start with wsnet or medetec
    image_extensions = {'.png', '.jpg', '.jpeg'}
    prefixes = ('wsnet', 'medetec')
    
    images_to_copy: list[Path] = []
    
    for root, dirs, files in os.walk(dataset_path):
        root_path = Path(root)
        
        # Only process train/test image directories
        if 'train_images' in str(root_path) or 'test_images' in str(root_path):
            for file in files:
                file_lower = file.lower()
                if any(file_lower.startswith(prefix) for prefix in prefixes):
                    if any(file_lower.endswith(ext) for ext in image_extensions):
                        images_to_copy.append(root_path / file)
    
    print(f"Found {len(images_to_copy)} images matching criteria (wsnet* or medetec*)")
    
    # Copy images to target directory
    copied_files: list[str] = []
    for img_path in images_to_copy:
        target_name = img_path.name
        target_path = target_dir / target_name
        
        if target_path.exists():
            print(f"Skipping {target_name} (already exists)")
        else:
            shutil.copy2(img_path, target_path)
            print(f"Copied: {target_name}")
        
        copied_files.append(target_name)
    
    # Load existing images list
    if images_list_path.exists():
        with open(images_list_path, 'r') as f:
            existing_images = json.load(f)
    else:
        existing_images = []
    
    # Add new images to the list
    existing_set = set(existing_images)
    new_images = [img for img in copied_files if img not in existing_set]
    
    print(f"Adding {len(new_images)} new images to images_list.json")
    
    # Combine and sort
    all_images = sorted(set(existing_images + copied_files))
    
    # Save updated list
    with open(images_list_path, 'w') as f:
        json.dump(all_images, f)
    
    print(f"\nSummary:")
    print(f"  Total images in list: {len(all_images)}")
    print(f"  New images added: {len(new_images)}")
    print(f"  Images copied: {len(copied_files)}")
    print("Done!")


if __name__ == "__main__":
    main()
