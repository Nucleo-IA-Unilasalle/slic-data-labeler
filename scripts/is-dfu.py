import os
import random
from pathlib import Path
from typing import Optional, Tuple

import kagglehub
import mlflow
import mlflow.pytorch
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image
from torch.utils.data import ConcatDataset, DataLoader, Dataset
from torchvision import transforms
from tqdm import tqdm


def download_dfu_dataset() -> str:
    """Download purushomohan dfu-wagners-classification dataset and return path."""
    path = kagglehub.dataset_download("purushomohan/dfu-wagners-classification")
    print("Path to DFU dataset files:", path)
    return path

def download_tiny_imagenet_dataset() -> str:
    """Download Tiny ImageNet dataset and return path."""
    path = kagglehub.dataset_download("monsonrejiverghese/tiny-imagenet-subset")
    print("Path to Tiny ImageNet dataset files:", path)
    return path

def download_yasinpratomo_wound_dataset() -> str:
    """Download yasinpratomo wound-dataset and return path."""
    path2 = kagglehub.dataset_download("yasinpratomo/wound-dataset")
    print("Path to yasinpratomo wound-dataset files:", path2)
    return path2

def dowload_ascanipek_skin_diseases_dataset() -> str:
    """Download ascanipek skin-diseases dataset and return path."""
    path3 = kagglehub.dataset_download("ascanipek/skin-diseases")
    print("Path to ascanipek skin-diseases dataset files:", path3)
    return path3

# TODO: DFUDataset and NonDFUDataset classes could inherit from another class to
# make the documentation more easily maintainable.
class DFUDataset(Dataset):
    """
    Datasets for DFU images, including:
    + purushomohan dfu-wagners-classification - class 1
    """

    def __init__(self, dfu_path: str, split: str, transform: Optional[transforms.Compose]):
        """
        Initialize DFU dataset using all the datasets.

        Args:
            positive_paths: List of paths to the datasets
            split: 'train' | 'validation' | 'test'
            transform: Image transformations to apply
        """
        self.transform = transform
        self.image_paths = []
        self.labels = []

        base_path = Path(dfu_path) / "Dataset"
        folder_name = ""

        if split == "train":
            folder_name = "Training"
        else:
            folder_name = "Validation"
        base_path = base_path / folder_name

        DFU_grades = ["Grade 0", "Grade 1", "Grade 2", "Grade 3"]
        image_paths = []
        for grade in DFU_grades:
            grade_path = base_path / grade
            if grade_path.exists():
                for img_file in grade_path.glob("*.jpg"):
                    image_paths.append(str(img_file))

        if split != "train":
            random.seed(42)
            random.shuffle(image_paths)

            validation_split_index = int(len(image_paths) * 0.5)

            if split == "validation":
                image_paths = image_paths[:validation_split_index]
                print(f"DFUDataset: Using {len(image_paths)} images for VALIDATION")
            elif split == "test":
                image_paths = image_paths[validation_split_index:]
                print(f"DFUDataset: Using {len(image_paths)} images for TEST")
            else:
                print("Error: missing parameter. Parameter 'split' is not one of 'train' | 'validation' | 'test' or is not defined.")
        else:
            print(f"DFUDataset: Using {len(image_paths)} images for TRAIN")

        for img_file in image_paths:
            self.image_paths.append(img_file)
            self.labels.append(1)

        print(f"Loaded {len(self.image_paths)} DFU images for {split} split")

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        img_path = self.image_paths[idx]
        label = self.labels[idx]

        image = Image.open(img_path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, label


class NonDFUDataset(Dataset):
    """
    Datasets for non-DFU images, including:
    + Tiny ImageNet - class 0
    + Yasinpratomo Wound-dataset - class 0
    + ascanipek skin-diseases - class 0
    """

    # TODO: add parameter for selection of datasets per sub-class ("objects", "wounds" to filter)
    def __init__(
        self,
        negative_paths: list[str],
        split: str,
        transform: Optional[transforms.Compose],
        max_samples: Optional[int]
    ):
        """
        Initialize non-DFU dataset using all the datasets.

        Args:
            negative_paths: List of paths to the datasets
            split: 'train' | 'validation' | 'test'
            transform: Image transformations to apply
            max_samples: Maximum number of samples to use (None for all)
        """
        self.transform = transform
        self.image_paths = []

        for dataset_root in negative_paths:
            root_path = Path(dataset_root)

            for img_file in root_path.glob("**/*.JPEG"):
                self.image_paths.append(str(img_file))
            for img_file in root_path.glob("**/*.jpeg"):
                self.image_paths.append(str(img_file))
            for img_file in root_path.glob("**/*.jpg"):
                self.image_paths.append(str(img_file))

        random.seed(42)
        random.shuffle(self.image_paths)

        train_split_index = int(len(self.image_paths) * 0.8)
        validation_split_index = int(len(self.image_paths) * 0.9)

        if split == "train":
            self.image_paths = self.image_paths[:train_split_index]
            print(f"NonDFUDataset: Using {len(self.image_paths)} images for TRAIN")
        elif split == "validation":
            self.image_paths = self.image_paths[train_split_index:validation_split_index]
            print(f"NonDFUDataset: Using {len(self.image_paths)} images for VALIDATION")
        elif split == "test":
            self.image_paths = self.image_paths[validation_split_index:]
            print(f"NonDFUDataset: Using {len(self.image_paths)} images for TEST")
        else:
            print("Error: missing parameter. Parameter 'split' is not one of 'train' | 'validation' | 'test' or is not defined.")

        if max_samples is not None:
            self.image_paths = self.image_paths[:max_samples]

        print(f"Using {len(self.image_paths)} Non-DFU images (negatives) for the split {split}")

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        img_path = self.image_paths[idx]
        image = Image.open(img_path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, 0


def get_transforms(image_size: int, split: str) -> transforms.Compose:
    """
    Get image transformations for specified split.

    Args:
        image_size: Target image size
        split: 'train' | 'validation' | 'test'

    Returns:
        Composed transformations
    """
    if split == "train":
        return transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    else:
        return transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])


def create_dataloader(
    dfu_path: str,
    negative_paths: list[str],
    split: str,
    batch_size: int,
    image_size: int,
    num_workers: int,
    max_imagenet_samples: Optional[int]
) -> DataLoader:
    """
    Create combined dataloader for DFU detection (DFU vs non-DFU).

    Args:
        dfu_path: Path to DFU dataset
        imagenet_path: Path to ImageNet dataset
        split: 'train', 'val', or 'test'
        batch_size: Batch size for dataloader
        image_size: Target image size
        num_workers: Number of worker processes
        max_imagenet_samples: Maximum ImageNet samples to use (None for all)

    Returns:
        DataLoader combining DFU and non-DFU images
    """
    transform = get_transforms(image_size=image_size, split=split)

    DFU_dataset = DFUDataset(
        dfu_path=dfu_path,
        split=split,
        transform=transform
    )

    non_DFU_dataset = NonDFUDataset(
        negative_paths=negative_paths,
        split=split,
        transform=transform,
        max_samples=max_imagenet_samples
    )

    combined_dataset = ConcatDataset([DFU_dataset, non_DFU_dataset])

    dataloader = DataLoader(
        combined_dataset,
        batch_size=batch_size,
        shuffle=(split == "train"),
        num_workers=num_workers,
        pin_memory=True
    )

    print(f"{split.upper()} DataLoader: {len(combined_dataset)} total images")
    print(f"  - DFUs (class 1): {len(DFU_dataset)}")
    print(f"  - Non-DFUs (class 0): {len(non_DFU_dataset)}")

    return dataloader


def get_dataloaders(
    batch_size: int = 32,
    image_size: int = 224,
    num_workers: int = 4,
    max_imagenet_train_samples: Optional[int] = None,
    max_imagenet_val_samples: Optional[int] = None,
    max_imagenet_test_samples: Optional[int] = None
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    """
    Get train, validation, and test dataloaders for DFU detection.

    Args:
        batch_size: Batch size for dataloaders
        image_size: Target image size
        num_workers: Number of worker processes
        max_imagenet_train_samples: Max Tiny ImageNet samples for train split (None for all)
        max_imagenet_val_samples: Max Tiny ImageNet samples for val split (None for all)
        max_imagenet_test_samples: Max Tiny ImageNet samples for test split (None for all)

    Returns:
        Tuple of (train_dataloader, val_dataloader, test_dataloader)
    """
    dfu_path = download_dfu_dataset()

    neg_path_tiny_imagenet = download_tiny_imagenet_dataset()
    neg_path_yasinpratomo = download_yasinpratomo_wound_dataset()
    neg_path_ascanipek = dowload_ascanipek_skin_diseases_dataset()

    negative_paths_list = [
        neg_path_tiny_imagenet,
        neg_path_yasinpratomo,
        neg_path_ascanipek
    ]

    train_loader = create_dataloader(
        dfu_path=dfu_path,
        negative_paths=negative_paths_list,
        split="train",
        batch_size=batch_size,
        image_size=image_size,
        num_workers=num_workers,
        max_imagenet_samples=max_imagenet_train_samples
    )

    val_loader = create_dataloader(
        dfu_path=dfu_path,
        negative_paths=negative_paths_list,
        split="validation",
        batch_size=batch_size,
        image_size=image_size,
        num_workers=num_workers,
        max_imagenet_samples=max_imagenet_val_samples
    )

    test_loader = create_dataloader(
        dfu_path=dfu_path,
        negative_paths=negative_paths_list,
        split="test",
        batch_size=batch_size,
        image_size=image_size,
        num_workers=num_workers,
        max_imagenet_samples=max_imagenet_test_samples
    )

    return train_loader, val_loader, test_loader


class SimpleCNN(nn.Module):
    def __init__(self):
        super(SimpleCNN, self).__init__()

        self.feature_extractor = nn.Sequential(
            # Camada 1
            nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2), # H/2, W/2

            # Camada 2
            nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2), # H/4, W/4

            # Camada 3
            nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2), # H/8, W/8
        )

        self.adaptive_pool = nn.AdaptiveAvgPool2d((7, 7))

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 1)
        )

    def forward(self, x):
        x = self.feature_extractor(x)
        x = self.adaptive_pool(x)
        x = self.classifier(x)
        return x


def evaluate_model(model, dataloader, criterion, device):
    """Evaluates the model on the given dataloader."""
    model.eval()
    total_loss = 0.0
    correct_predictions = 0
    total_samples = 0

    with torch.no_grad():
        for images, labels in tqdm(dataloader, desc="Evaluating"):
            images = images.to(device)
            labels = labels.to(device).float().unsqueeze(1)

            outputs = model(images)
            loss = criterion(outputs, labels)
            total_loss += loss.item()

            probabilities = torch.sigmoid(outputs)
            predictions = (probabilities > 0.5).float()

            correct_predictions += (predictions == labels).sum().item()
            total_samples += labels.size(0)

    avg_loss = total_loss / len(dataloader)
    accuracy = correct_predictions / total_samples
    return avg_loss, accuracy

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Usando dispositivo: {device}")

train_loader, val_loader, test_loader = get_dataloaders(
    batch_size=32,
    image_size=224,
    num_workers=4,
    max_imagenet_train_samples=408,
    max_imagenet_val_samples=67
)

# FIXME: inconsistencias de nomenclaturas ingles/ptbr (e.g. train_loader, funcao_de_perda)
def run_training(model, train_loader, val_loader, loss_function, optimizer, scheduler, num_epochs, device):
    """Runs the training loop."""
    for epoch in range(num_epochs):
        model.train()
        epoch_loss = 0.0

        for imagens, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}/{num_epochs} [TRAIN]"):
            imagens = imagens.to(device)
            # CRUCIAL: Ajusta o formato para [Batch, 1]
            labels = labels.to(device).float().unsqueeze(1)

            optimizer.zero_grad()

            # 2. Forward pass (previsão)
            previsoes = model(imagens)

            # 3. Calcular a perda (o erro)
            perda = loss_function(previsoes, labels)

            # 4. Backward Pass (Retropropagação)
            perda.backward()

            # 5. Atualiza os pesos e bias
            optimizer.step()

            epoch_loss += perda.item()

        avg_loss = epoch_loss / len(train_loader)
        scheduler.step()
        print(f"[{epoch+1}/{num_epochs}] Perda Média: {avg_loss:.4f} | LR: {optimizer.param_groups[0]['lr']:.6f}")


if __name__ == "__main__":
    MODEL_NAME = "SimpleCNN_v1_baseline"
    EXPERIMENT_NAME = "DFU_filter"

    PARAM_BATCH_SIZE = 32
    PARAM_IMAGE_SIZE = 224
    PARAM_NUM_WORKERS = 4
    PARAM_LEARNING_RATE = 0.001
    PARAM_NUM_EPOCHS = 20
    PARAM_OPTIMIZER = "Adam"
    PARAM_SCHEDULER = "StepLR_10_0.1"

    mlflow.set_experiment(EXPERIMENT_NAME)

    with mlflow.start_run(run_name=MODEL_NAME):
        print(f"Starting run with MLFlow: {MODEL_NAME}")

        print("A registar hiperparâmetros no MLflow...")
        mlflow.log_param("model_name", MODEL_NAME)
        mlflow.log_param("batch_size", PARAM_BATCH_SIZE)
        mlflow.log_param("image_size", PARAM_IMAGE_SIZE)
        mlflow.log_param("learning_rate", PARAM_LEARNING_RATE)
        mlflow.log_param("num_epochs", PARAM_NUM_EPOCHS)
        mlflow.log_param("optimizer", PARAM_OPTIMIZER)
        mlflow.log_param("scheduler", PARAM_SCHEDULER)
        mlflow.log_param("max_imagenet_train", 408)
        mlflow.log_param("max_imagenet_val", 67)

        train_loader, val_loader, test_loader = get_dataloaders(
            batch_size=PARAM_BATCH_SIZE,
            image_size=PARAM_IMAGE_SIZE,
            num_workers=PARAM_NUM_WORKERS,
            max_imagenet_train_samples=408,
            max_imagenet_val_samples=67
        )

        model = SimpleCNN()
        model.to(device)

        loss_function = nn.BCEWithLogitsLoss()
        optimizer = optim.Adam(model.parameters(), lr=PARAM_LEARNING_RATE)
        scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.1)
        run_training(model, train_loader, val_loader, loss_function,
                     optimizer, scheduler, PARAM_NUM_EPOCHS, device)

        print("\n" + 5 * "*" + " MODEL READY FOR TESTING " + 5 * "*")

        final_loss, final_accuracy = evaluate_model(model, val_loader, loss_function, device)

        print("\n" + 5 * "*" + " FINAL TESTING RESULT " + 5 * "*")
        print(f"TEST SET LOSS: {final_loss:.4f}")
        print(f"FINAL ACCURACY: {final_accuracy:.2%}")

        print("\n" + 5 * "*" + " REGISTERING METRICS TO MLFLOW " + 5 * "*")
        mlflow.log_metric("final_validation_loss", final_loss)
        mlflow.log_metric("final_validation_accuracy", final_accuracy)
        mlflow.pytorch.log_model(model, "model_artifacts")

        print("\n" + 5 * "*" + " REGISTERING ENDED " + 5 * "*")

# FIXME: Sanity-check after the training is complete does not make sense
# print("Creating dataloaders with small sample size...")
# train_loader, val_loader, test_loader = get_dataloaders(
#     batch_size=8,
#     image_size=224,
#     num_workers=0,
#     max_imagenet_train_samples=500,
#     max_imagenet_val_samples=200
# )
# print("\nTesting train dataloader...")
# images, labels = next(iter(train_loader))
# print(f"Batch shape: {images.shape}")
# print(f"Labels shape: {labels.shape}")
# print(f"Unique labels: {labels.unique().tolist()}")
# print(f"Class distribution in batch: 0={(labels==0).sum().item()}, 1={(labels==1).sum().item()}")
# print("\nTesting val dataloader...")
# images, labels = next(iter(val_loader))
# print(f"Batch shape: {images.shape}")
# print(f"Labels shape: {labels.shape}")
# print(f"Unique labels: {labels.unique().tolist()}")
# print(f"Class distribution in batch: 0={(labels==0).sum().item()}, 1={(labels==1).sum().item()}")
# print("\nDataloader test successful!")
