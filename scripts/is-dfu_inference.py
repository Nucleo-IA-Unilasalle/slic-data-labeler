import os
import sys
import json
import numpy as np
import cv2
import torch
import torch.nn as nn
from typing import Tuple
from PIL import Image
from torchvision import transforms


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


def get_inference_transform(image_size: int) -> transforms.Compose:
    """
    Get image transformations for inference.
    
    Args:
        image_size: Target image size
    
    Returns:
        Composed transformations
    """
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])


def run_inference(
    model_path: str,
    image_path: str,
    image_size: int
) -> dict:
    """
    Run DFU classification inference on a single image.
    
    Args:
        model_path: Path to the trained model
        image_path: Path to the input image
        image_size: Target size for model input
    
    Returns:
        Dictionary with prediction results
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # Initialize model architecture
    model = SimpleCNN()
    
    # Load model weights (state dict)
    # Try loading as state dict first, fallback to full model if needed
    try:
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
    except Exception:
        # If loading as state dict fails (e.g., model saved with cloudpickle/MLflow),
        # try loading full model with weights_only=False
        # This is safe since we trust our own model files
        try:
            loaded_model = torch.load(model_path, map_location=device, weights_only=False)
            if isinstance(loaded_model, nn.Module):
                model.load_state_dict(loaded_model.state_dict())
            else:
                model.load_state_dict(loaded_model)
        except Exception as load_error:
            raise RuntimeError(
                f"Failed to load model from {model_path}. "
                f"The model file may have been saved with an incompatible Python version. "
                f"Please re-save the model using: torch.save(model.state_dict(), 'is-dfu.pth'). "
                f"Original error: {str(load_error)}"
            )
    
    model = model.to(device)
    model.eval()
    
    # Load and preprocess image
    image = Image.open(image_path).convert("RGB")
    transform = get_inference_transform(image_size=image_size)
    image_tensor = transform(image).unsqueeze(0).to(device)
    
    # Run inference
    with torch.no_grad():
        output = model(image_tensor)
        probability = torch.sigmoid(output).cpu().item()
        is_dfu = probability > 0.5
    
    result = {
        'image_path': image_path,
        'is_dfu': bool(is_dfu),
        'probability': float(probability),
        'confidence': float(probability if is_dfu else 1.0 - probability)
    }
    
    return result


def main() -> None:
    """Main function."""
    if len(sys.argv) != 4:
        print(json.dumps({'error': 'Usage: python is-dfu_inference.py <model_path> <image_path> <output_json_path>'}))
        sys.exit(1)
    
    model_path = sys.argv[1]
    image_path = sys.argv[2]
    output_json_path = sys.argv[3]
    
    try:
        IMAGE_SIZE = 224
        
        result = run_inference(
            model_path=model_path,
            image_path=image_path,
            image_size=IMAGE_SIZE
        )
        
        # Save result
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        
        print(json.dumps({'success': True, 'output_path': output_json_path}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

