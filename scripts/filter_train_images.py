import csv
import os
from pathlib import Path


def get_images_from_csv(csv_path: str) -> set:
    """Extract image names from CSV file."""
    images = set()
    try:
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row and row.get('image_name'):
                    images.add(row['image_name'].strip())
    except Exception as e:
        print(f"Error reading {csv_path}: {e}")
    return images


def main() -> None:
    """Filter train_images folder to keep only images in both CSV files."""
    # Get paths
    base_dir = Path(__file__).parent.parent
    slic_csv = base_dir / 'app' / 'api' / 'supervision' / 'slic.csv'
    vlm_csv = base_dir / 'app' / 'api' / 'supervision' / 'vlm.csv'
    train_images_dir = base_dir / 'app' / 'train_images'

    # Read image names from both CSVs
    slic_images = get_images_from_csv(str(slic_csv))
    vlm_images = get_images_from_csv(str(vlm_csv))

    print(f"Images in slic.csv: {len(slic_images)}")
    print(f"Images in vlm.csv: {len(vlm_images)}")

    # Find intersection (images in both CSVs)
    valid_images = slic_images & vlm_images
    print(f"Images in both CSVs: {len(valid_images)}")

    if not valid_images:
        print("No images found in both CSV files!")
        return

    # Get all images in train_images folder
    train_images = set()
    for img_file in train_images_dir.glob('*.png'):
        train_images.add(img_file.name)

    print(f"Total images in train_images folder: {len(train_images)}")

    # Find images to delete (in folder but not in both CSVs)
    images_to_delete = train_images - valid_images
    print(f"Images to delete: {len(images_to_delete)}")

    if images_to_delete:
        print("\nDeleting images not in both CSVs...")
        for img_name in sorted(images_to_delete):
            img_path = train_images_dir / img_name
            try:
                img_path.unlink()
                print(f"  Deleted: {img_name}")
            except Exception as e:
                print(f"  Error deleting {img_name}: {e}")

        print(f"\nSuccessfully deleted {len(images_to_delete)} images")
    else:
        print("\nNo images to delete - all images are in both CSVs!")

    # Final count
    remaining_images = len([f for f in train_images_dir.glob('*.png')])
    print(f"Remaining images in train_images: {remaining_images}")


if __name__ == '__main__':
    main()
