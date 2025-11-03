import os
import sys
import json
import numpy as np
import torch
import torch.nn as nn
from typing import Tuple
from PIL import Image
from torchvision import transforms
from torchvision.models import efficientnet_b4, EfficientNet_B4_Weights


class UNetBlock(nn.Module):
    """Basic convolutional block for U-Net."""
    
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        return x


class EfficientNetUNet(nn.Module):
    """U-Net architecture with EfficientNet-B4 encoder for binary segmentation."""
    
    def __init__(self, out_channels: int = 1, pretrained: bool = True):
        super().__init__()
        
        # Load pretrained EfficientNet-B4 as encoder
        if pretrained:
            weights = EfficientNet_B4_Weights.IMAGENET1K_V1
            efficientnet = efficientnet_b4(weights=weights)
        else:
            efficientnet = efficientnet_b4(weights=None)
        
        self.encoder = efficientnet.features
        
        # Decoder with skip connections
        self.dec5 = UNetBlock(1792 + 272, 272)
        
        self.upconv4 = nn.ConvTranspose2d(272, 160, kernel_size=2, stride=2)
        self.dec4 = UNetBlock(160 + 160, 160)
        
        self.upconv3 = nn.ConvTranspose2d(160, 56, kernel_size=2, stride=2)
        self.dec3 = UNetBlock(56 + 56, 56)
        
        self.upconv2 = nn.ConvTranspose2d(56, 32, kernel_size=2, stride=2)
        self.dec2 = UNetBlock(32 + 32, 32)
        
        self.upconv1 = nn.ConvTranspose2d(32, 24, kernel_size=2, stride=2)
        self.dec1 = UNetBlock(24 + 24, 24)
        
        self.upconv0 = nn.ConvTranspose2d(24, 16, kernel_size=2, stride=2)
        self.dec0 = UNetBlock(16, 16)
        
        self.out = nn.Conv2d(16, out_channels, kernel_size=1)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Encoder with skip connections
        enc0 = self.encoder[0](x)
        enc1 = self.encoder[1](enc0)
        enc2 = self.encoder[2](enc1)
        enc3 = self.encoder[3](enc2)
        enc4 = self.encoder[4](enc3)
        enc5 = self.encoder[5](enc4)
        enc6 = self.encoder[6](enc5)
        enc7 = self.encoder[7](enc6)
        bottleneck = self.encoder[8](enc7)
        
        # Decoder with skip connections
        dec5 = torch.cat([bottleneck, enc6], dim=1)
        dec5 = self.dec5(dec5)
        
        dec4 = self.upconv4(dec5)
        dec4 = torch.cat([dec4, enc5], dim=1)
        dec4 = self.dec4(dec4)
        
        dec3 = self.upconv3(dec4)
        dec3 = torch.cat([dec3, enc3], dim=1)
        dec3 = self.dec3(dec3)
        
        dec2 = self.upconv2(dec3)
        dec2 = torch.cat([dec2, enc2], dim=1)
        dec2 = self.dec2(dec2)
        
        dec1 = self.upconv1(dec2)
        dec1 = torch.cat([dec1, enc1], dim=1)
        dec1 = self.dec1(dec1)
        
        dec0 = self.upconv0(dec1)
        dec0 = self.dec0(dec0)
        
        return torch.sigmoid(self.out(dec0))


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
    ])


def run_inference(
    model_path: str,
    image_path: str,
    image_size: int
) -> dict:
    """
    Run wound segmentation inference on a single image.
    
    Args:
        model_path: Path to the trained model
        image_path: Path to the input image
        image_size: Target size for model input
    
    Returns:
        Dictionary with segmentation results
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # Load model
    model = EfficientNetUNet(out_channels=1, pretrained=False)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model = model.to(device)
    model.eval()
    
    # Load and preprocess image
    image = Image.open(image_path).convert("RGB")
    original_size = image.size
    
    transform = get_inference_transform(image_size=image_size)
    image_tensor = transform(image).unsqueeze(0).to(device)
    
    # Run inference
    with torch.no_grad():
        output = model(image_tensor)
        mask_tensor = output.squeeze(0).squeeze(0).cpu()
    
    # Convert to binary mask (threshold at 0.5)
    binary_mask = (mask_tensor > 0.5).float()
    
    # Resize mask back to original image size
    mask_pil = transforms.ToPILImage()(binary_mask)
    mask_resized = mask_pil.resize(original_size, Image.NEAREST)
    
    # Convert to numpy array for JSON serialization
    mask_array = np.array(mask_resized)
    
    # Calculate statistics
    total_pixels = mask_array.size
    wound_pixels = np.sum(mask_array > 0)
    wound_percentage = (wound_pixels / total_pixels) * 100 if total_pixels > 0 else 0
    
    result = {
        'image_path': image_path,
        'original_width': original_size[0],
        'original_height': original_size[1],
        'mask': mask_array.tolist(),
        'wound_pixels': int(wound_pixels),
        'total_pixels': int(total_pixels),
        'wound_percentage': float(wound_percentage)
    }
    
    return result


def main() -> None:
    """Main function."""
    if len(sys.argv) != 4:
        print(json.dumps({'error': 'Usage: python segmentation_inference.py <model_path> <image_path> <output_json_path>'}))
        sys.exit(1)
    
    model_path = sys.argv[1]
    image_path = sys.argv[2]
    output_json_path = sys.argv[3]
    
    try:
        IMAGE_SIZE: int = 256
        
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

