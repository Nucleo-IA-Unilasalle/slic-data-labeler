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
    
    # Load model
    model = torch.load(model_path, map_location=device, weights_only=False)
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
        IMAGE_SIZE: int = 224
        
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

