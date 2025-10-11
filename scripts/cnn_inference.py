import os
import sys
import json
import numpy as np
import cv2
import torch
import torch.nn as nn
from typing import Dict, List, Tuple


class TissueClassificationCNN(nn.Module):
    """Dual-input CNN for tissue classification score prediction."""
    
    def __init__(self, input_size: Tuple[int, int]):
        """
        Initialize dual-input CNN.
        
        Args:
            input_size: Input image size (height, width)
        """
        super(TissueClassificationCNN, self).__init__()
        
        # Full image pathway - REDUCED for small dataset
        self.full_image_conv = nn.Sequential(
            # Conv block 1
            nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, padding=1),
            nn.BatchNorm2d(num_features=16),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            
            # Conv block 2
            nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1),
            nn.BatchNorm2d(num_features=32),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(output_size=(4, 4))
        )
        
        # Cluster pathway - REDUCED for small dataset
        self.cluster_conv = nn.Sequential(
            # Conv block 1
            nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, padding=1),
            nn.BatchNorm2d(num_features=16),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            
            # Conv block 2
            nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1),
            nn.BatchNorm2d(num_features=32),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(output_size=(4, 4))
        )
        
        # Merged fully connected layers with SLIC scores - MUCH SMALLER
        # Layer 1: (32*4*4)*2 + 3 = 1027 -> 64
        self.fc1 = nn.Linear(in_features=(32 * 4 * 4) * 2 + 3, out_features=64)
        self.fc1_activation = nn.LeakyReLU()
        self.fc1_dropout = nn.Dropout(p=0.5)
        
        # Layer 2: 64 + 3 = 67 -> 32
        self.fc2 = nn.Linear(in_features=64 + 3, out_features=32)
        self.fc2_activation = nn.LeakyReLU()
        self.fc2_dropout = nn.Dropout(p=0.3)
        
        # Layer 3: 32 + 3 = 35 -> 3
        self.fc3 = nn.Linear(in_features=32 + 3, out_features=3)
        
        # Softmax to ensure outputs sum to 1 (probability distribution)
        self.softmax = nn.Softmax(dim=1)
    
    def forward(
        self,
        full_image: torch.Tensor,
        cluster_mask: torch.Tensor,
        original_scores: torch.Tensor
    ) -> torch.Tensor:
        """
        Forward pass with dual inputs and original SLIC scores concatenated at each FC layer.
        
        Args:
            full_image: Full wound image tensor (B, 3, H, W)
            cluster_mask: Cluster-masked image tensor (B, 3, H, W)
            original_scores: Original SLIC scores tensor (B, 3) - [necrosis, slough, red_tissue]
        
        Returns:
            Refined scores tensor (B, 3) - [necrosis, slough, red_tissue]
        """
        # Process full image through its pathway
        full_features = self.full_image_conv(full_image)
        
        # Process cluster through its pathway
        cluster_features = self.cluster_conv(cluster_mask)
        
        # Flatten both
        full_features_flat = torch.flatten(full_features, start_dim=1)
        cluster_features_flat = torch.flatten(cluster_features, start_dim=1)
        
        # Concatenate visual features + original SLIC scores for first layer
        x = torch.cat([full_features_flat, cluster_features_flat, original_scores], dim=1)
        
        # FC Layer 1 with SLIC scores
        x = self.fc1(x)
        x = self.fc1_activation(x)
        x = self.fc1_dropout(x)
        
        # FC Layer 2 with SLIC scores
        x = torch.cat([x, original_scores], dim=1)
        x = self.fc2(x)
        x = self.fc2_activation(x)
        x = self.fc2_dropout(x)
        
        # FC Layer 3 with SLIC scores (output layer)
        x = torch.cat([x, original_scores], dim=1)
        logits = self.fc3(x)
        
        # Apply softmax to ensure outputs sum to 1
        output = self.softmax(logits)
        
        return output


def extract_dual_inputs(
    img_bgr: np.ndarray,
    mask_bgr: np.ndarray,
    labels: np.ndarray,
    cluster_id: int,
    target_size: Tuple[int, int]
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract full image and cluster mask for dual-input architecture.
    
    Args:
        img_bgr: Full image in BGR
        mask_bgr: Wound mask
        labels: Cluster labels for each pixel
        cluster_id: Target cluster ID
        target_size: Target size (height, width)
    
    Returns:
        Tuple of (full_image_tensor, cluster_mask_tensor)
    """
    # Resize full image to target size
    img_resized: np.ndarray = cv2.resize(img_bgr, (target_size[1], target_size[0]))
    img_rgb: np.ndarray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
    img_normalized: np.ndarray = img_rgb.astype(np.float32) / 255.0
    full_image_tensor: np.ndarray = np.transpose(img_normalized, (2, 0, 1))
    
    # Create cluster mask
    cluster_mask: np.ndarray = ((labels == cluster_id) & (mask_bgr > 0)).astype(np.uint8)
    
    # Apply cluster mask to original image
    cluster_only: np.ndarray = cv2.bitwise_and(img_bgr, img_bgr, mask=cluster_mask)
    
    # Resize cluster image
    cluster_resized: np.ndarray = cv2.resize(cluster_only, (target_size[1], target_size[0]))
    cluster_rgb: np.ndarray = cv2.cvtColor(cluster_resized, cv2.COLOR_BGR2RGB)
    cluster_normalized: np.ndarray = cluster_rgb.astype(np.float32) / 255.0
    cluster_tensor: np.ndarray = np.transpose(cluster_normalized, (2, 0, 1))
    
    return full_image_tensor, cluster_tensor


def run_inference(
    model_path: str,
    data_json_path: str,
    target_size: Tuple[int, int]
) -> Dict:
    """
    Run CNN inference on wound data.
    
    Args:
        model_path: Path to the trained model
        data_json_path: Path to the data JSON file
        target_size: Target size for model input
    
    Returns:
        Dictionary with predictions for each cluster
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # Load model
    model = TissueClassificationCNN(input_size=target_size)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model = model.to(device)
    model.eval()
    
    # Load data
    with open(data_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Convert to numpy arrays
    img_bgr: np.ndarray = np.array(data['img_bgr'], dtype=np.uint8)
    mask_bgr: np.ndarray = np.array(data['mask_bgr'], dtype=np.uint8)
    labels: np.ndarray = np.array(data['labels'], dtype=np.int32)
    
    # Run inference on each cluster
    predictions: List[Dict] = []
    
    with torch.no_grad():
        for cluster in data['clusters']:
            cluster_id: int = cluster['cluster_id']
            original_scores = cluster['scores']
            
            # Extract inputs
            full_image, cluster_mask = extract_dual_inputs(
                img_bgr=img_bgr,
                mask_bgr=mask_bgr,
                labels=labels,
                cluster_id=cluster_id,
                target_size=target_size
            )
            
            # Prepare tensors
            full_image_tensor = torch.from_numpy(full_image).unsqueeze(0).to(device)
            cluster_mask_tensor = torch.from_numpy(cluster_mask).unsqueeze(0).to(device)
            
            # Prepare and normalize original SLIC scores (same as training)
            original_scores_array = np.array([
                original_scores['necrosis'],
                original_scores['slough'],
                original_scores['red_tissue']
            ], dtype=np.float32)
            
            # Normalize original scores to sum to 1
            original_sum: float = np.sum(original_scores_array)
            if original_sum > 0:
                original_scores_array = original_scores_array / original_sum
            else:
                # Handle zero case - uniform distribution
                original_scores_array = np.array([1.0/3.0, 1.0/3.0, 1.0/3.0], dtype=np.float32)
            
            original_scores_tensor = torch.from_numpy(original_scores_array).unsqueeze(0).to(device)
            
            # Run inference
            output = model(full_image_tensor, cluster_mask_tensor, original_scores_tensor)
            
            # Get predictions (already softmaxed, so they sum to 1)
            pred_scores_normalized = output.cpu().numpy()[0]
            
            # Determine tissue type based on highest score
            tissue_types = ['necrosis', 'slough', 'red_tissue']
            tissue_type = tissue_types[np.argmax(pred_scores_normalized)]
            
            prediction: Dict = {
                'cluster_id': cluster_id,
                'original_scores': original_scores,
                'predicted_scores': {
                    'necrosis': float(pred_scores_normalized[0]),
                    'slough': float(pred_scores_normalized[1]),
                    'red_tissue': float(pred_scores_normalized[2])
                },
                'tissue_type': tissue_type,
                'pixel_count': cluster['pixel_count'],
                'center_y': cluster['center_y'],
                'center_x': cluster['center_x']
            }
            
            predictions.append(prediction)
    
    # Calculate overall tissue statistics
    total_necrosis = sum(p['predicted_scores']['necrosis'] for p in predictions)
    total_slough = sum(p['predicted_scores']['slough'] for p in predictions)
    total_red_tissue = sum(p['predicted_scores']['red_tissue'] for p in predictions)
    total_sum = total_necrosis + total_slough + total_red_tissue
    
    tissue_statistics = {
        'counts': {
            'necrosis': sum(1 for p in predictions if p['tissue_type'] == 'necrosis'),
            'slough': sum(1 for p in predictions if p['tissue_type'] == 'slough'),
            'red_tissue': sum(1 for p in predictions if p['tissue_type'] == 'red_tissue')
        },
        'pixel_counts': {
            'necrosis': sum(p['pixel_count'] for p in predictions if p['tissue_type'] == 'necrosis'),
            'slough': sum(p['pixel_count'] for p in predictions if p['tissue_type'] == 'slough'),
            'red_tissue': sum(p['pixel_count'] for p in predictions if p['tissue_type'] == 'red_tissue')
        },
        'percentages': {
            'necrosis': (total_necrosis / total_sum * 100) if total_sum > 0 else 0,
            'slough': (total_slough / total_sum * 100) if total_sum > 0 else 0,
            'red_tissue': (total_red_tissue / total_sum * 100) if total_sum > 0 else 0
        }
    }
    
    result = {
        'image_filename': data['image_filename'],
        'predictions': predictions,
        'tissue_statistics': tissue_statistics
    }
    
    return result


def main() -> None:
    """Main function."""
    if len(sys.argv) != 4:
        print(json.dumps({'error': 'Usage: python cnn_inference.py <model_path> <data_json_path> <output_json_path>'}))
        sys.exit(1)
    
    model_path = sys.argv[1]
    data_json_path = sys.argv[2]
    output_json_path = sys.argv[3]
    
    try:
        TARGET_SIZE: Tuple[int, int] = (224, 224)
        
        result = run_inference(
            model_path=model_path,
            data_json_path=data_json_path,
            target_size=TARGET_SIZE
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

