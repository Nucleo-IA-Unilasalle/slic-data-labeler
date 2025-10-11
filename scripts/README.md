# CNN Inference Scripts

This directory contains Python scripts for running CNN inference on wound data.

## Files

- `cnn_inference.py`: Main script for running CNN inference
- `requirements.txt`: Python dependencies

## Installation

Install the required Python packages:

```bash
pip install -r requirements.txt
```

Or using a virtual environment (recommended):

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Usage

### Command Line

You can run the inference script directly from the command line:

```bash
python cnn_inference.py <model_path> <data_json_path> <output_json_path>
```

**Arguments:**
- `model_path`: Path to the trained PyTorch model (.pth file)
- `data_json_path`: Path to the input data JSON file
- `output_json_path`: Path where the predictions will be saved

**Example:**

```bash
python scripts/cnn_inference.py \
  app/tissue_classification_model.pth \
  app/dataset/data_fusc_0011.json \
  output_predictions.json
```

### API Integration

The script is automatically called by the Next.js API endpoint at `/api/cnn-predict/[filename]`. The API handles:
- Loading the appropriate data file
- Running the Python script with correct paths
- Returning predictions to the frontend
- Caching predictions in `app/cnn_predictions_cache/` for faster subsequent requests

**Cache Endpoints:**
- `GET /api/cnn-predict/[filename]` - Get predictions (from cache if available)
- `DELETE /api/cnn-predict/[filename]` - Clear cache for specific file
- `DELETE /api/cnn-predict/cache` - Clear all cached predictions

## Model Architecture

The `TissueClassificationCNN` model uses a dual-input architecture:

1. **Full Image Pathway**
   - Processes the complete wound image
   - Captures global context and overall wound characteristics
   - 3 convolutional blocks with batch normalization

2. **Cluster Mask Pathway**
   - Processes cluster-specific masked regions
   - Focuses on local tissue features
   - 3 convolutional blocks with batch normalization

3. **SLIC Scores Input**
   - Incorporates initial SLIC predictions as additional features
   - Helps guide the CNN refinement process

4. **Fully Connected Layers**
   - Merges features from both pathways and SLIC scores
   - 4 dense layers with LeakyReLU activation and dropout
   - Outputs 3 tissue type scores (necrosis, slough, red_tissue)

## Input/Output Format

### Input (Data JSON)

The script expects a JSON file with the following structure:

```json
{
  "image_filename": "fusc_0011.png",
  "img_bgr": [[[b, g, r], ...], ...],
  "mask_bgr": [[val, ...], ...],
  "labels": [[cluster_id, ...], ...],
  "clusters": [
    {
      "cluster_id": 0,
      "scores": {
        "necrosis": 0.1,
        "slough": 0.2,
        "red_tissue": 0.7
      },
      "pixel_count": 100,
      "center_y": 50,
      "center_x": 50
    }
  ]
}
```

### Output (Predictions JSON)

The script outputs a JSON file with predictions:

```json
{
  "image_filename": "fusc_0011.png",
  "predictions": [
    {
      "cluster_id": 0,
      "original_scores": {
        "necrosis": 0.1,
        "slough": 0.2,
        "red_tissue": 0.7
      },
      "predicted_scores": {
        "necrosis": 0.05,
        "slough": 0.15,
        "red_tissue": 0.8
      },
      "tissue_type": "red_tissue",
      "pixel_count": 100,
      "center_y": 50,
      "center_x": 50
    }
  ],
  "tissue_statistics": {
    "counts": {
      "necrosis": 2,
      "slough": 1,
      "red_tissue": 7
    },
    "pixel_counts": {
      "necrosis": 200,
      "slough": 150,
      "red_tissue": 650
    },
    "percentages": {
      "necrosis": 20.0,
      "slough": 15.0,
      "red_tissue": 65.0
    }
  }
}
```

## Troubleshooting

### "No module named 'torch'"

Install PyTorch:
```bash
pip install torch
```

### "No module named 'cv2'"

Install OpenCV:
```bash
pip install opencv-python
```

### CUDA/GPU Issues

The script automatically detects and uses GPU if available. To force CPU usage:

```python
device = torch.device("cpu")
```

### Performance

- CPU inference: ~100-200ms per cluster
- GPU inference: ~10-20ms per cluster

For large datasets, consider:
- Using GPU acceleration
- Batch processing multiple clusters
- Caching predictions

