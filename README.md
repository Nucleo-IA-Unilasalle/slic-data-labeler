# Wound Analysis Visualizer

A Next.js application for visualizing wound tissue analysis with superpixel segmentation and cluster predictions. Features both SLIC algorithm-based classification and CNN model predictions.

## Features

- **SLIC Visualization**: View wound analysis using SLIC (Simple Linear Iterative Clustering) algorithm
- **CNN Visualization**: View wound analysis using trained CNN model for improved tissue classification
- **Interactive Interface**: Click and hover over clusters to inspect detailed tissue composition
- **Original Image Comparison**: Toggle between segmented and original images
- **Grid View**: Browse samples in a paginated grid layout for quick overview
  - Shows original wound images by default
  - Hover to see segmented view with tissue overlay
  - Display tissue composition percentages
  - Visual indicators for reviewed and seen files
  - Click to navigate to detailed view
  - Pagination (24 samples per page) for optimal performance
  - Bulk data loading (single API request per page instead of multiple requests)
- **Review System**: Manual review and correction of cluster classifications
- **Seen Tracking**: Mark samples as seen to avoid reviewing them multiple times
  - Random selector prioritizes unseen samples
  - Visual indicators for seen files
  - Persistent across browser sessions
- **Smart Filtering**: Sort files by tissue composition
  - Filter by most necrotic wounds
  - Filter by most slough
  - Filter by most red tissue
  - Helps systematic review of specific wound types

## Getting Started

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Python** (v3.8 or higher) - Required for CNN inference

### Installation

1. Install Node.js dependencies:

```bash
npm install
# or
bun install
```

2. Install Python dependencies for CNN inference:

```bash
pip install -r scripts/requirements.txt
```

### Running the Application

Start the development server:

```bash
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Project Structure

```
.
├── app/
│   ├── api/                      # API routes
│   │   ├── cnn-predict/         # CNN inference endpoint
│   │   ├── data-files/          # Data file endpoints
│   │   ├── data-files-bulk/     # Bulk data fetching endpoint (optimized)
│   │   └── original-image/      # Original image endpoints
│   ├── dataset/                  # SLIC-processed wound data
│   ├── dataset_reviewed/         # Human-reviewed corrections
│   ├── train_images/             # Original training images
│   ├── grid/                     # Grid view page
│   └── tissue_classification_model.pth  # Trained PyTorch model
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── wound-visualizer.tsx     # SLIC visualization component
│   └── wound-visualizer-cnn.tsx # CNN visualization component
├── scripts/
│   ├── cnn_inference.py         # Python script for CNN inference
│   └── requirements.txt         # Python dependencies
└── lib/
    └── types/                    # TypeScript type definitions
```

## How It Works

### SLIC Visualization (Default)

The SLIC algorithm segments the wound image into superpixels and classifies them based on color analysis in multiple color spaces (CIELab, RGB, CMYK). Each cluster is assigned tissue type scores for:
- **Necrosis** (black tissue)
- **Slough** (yellow tissue)
- **Red Tissue** (healthy granulation tissue)

### CNN Visualization

The CNN model refines the SLIC predictions using a dual-input architecture:
1. **Full Image Pathway**: Captures global wound context
2. **Cluster Mask Pathway**: Focuses on specific cluster features
3. **SLIC Scores Input**: Uses initial SLIC predictions as additional features

The model outputs refined tissue classification scores for each cluster, improving accuracy over the traditional SLIC approach.

**Performance Features:**
- **Automatic Caching**: CNN predictions are cached after first run for instant subsequent loading
- **Manual Refresh**: Use the refresh button to re-run inference and update cache
- **Cache Indicator**: "Cached" badge shows when predictions are loaded from cache

## Model Training

The CNN model was trained on wound images with human-reviewed corrections. For training details, see the `cnn_finetuning.py` script in the parent repository.

Model architecture:
- Input: 64x64 RGB images (full + cluster mask) + SLIC scores
- Dual convolutional pathways with batch normalization
- Fully connected layers with dropout regularization
- Output: 3 tissue type scores (necrosis, slough, red_tissue)

## Usage

### Detail View (Main Page)

1. **Select a data file** from the dropdown menu
2. **Choose prediction method**:
   - SLIC Algorithm: Fast, traditional approach
   - CNN Model: More accurate predictions (first run may be slow, subsequent runs are cached)
3. **Interact with the visualization**:
   - Click on clusters to select them
   - Hover over clusters to highlight them
   - Toggle overlay opacity to see the underlying image
   - Switch between segmented and original views
4. **Review and correct** (SLIC mode only):
   - Adjust tissue scores using sliders
   - Save corrections for model training
5. **Cache management** (CNN mode):
   - Predictions are automatically cached for fast reloading
   - Click refresh button to re-run inference and update cache
   - Look for "Cached" badge to see if predictions were loaded from cache
6. **Track reviewed samples**:
   - Click "Mark as Seen" to mark current file as reviewed
   - Random selector will prioritize unseen files
   - "Seen" badge appears on reviewed files
   - Click "Clear Seen (X)" to reset all seen markers
   - Hover over random button to see remaining unseen count
7. **Filter and sort files**:
   - Click filter button to sort by tissue type
   - "Most Necrosis" - Shows wounds with highest black tissue percentage
   - "Most Slough" - Shows wounds with highest yellow tissue percentage
   - "Most Red Tissue" - Shows wounds with highest healthy tissue percentage
   - "No Filter" - Returns to default alphabetical order

### Grid View

1. **Access grid view**: Click "Grid View" button in the main page header
2. **Browse samples**: View wound samples in a paginated grid layout (24 samples per page)
3. **View information**: Each card shows:
   - Original wound image
   - Sample filename
   - Tissue composition percentages (necrosis, slough, red tissue)
   - Review and seen status badges
4. **Hover to see analysis**: Hover over any card to switch from original image to segmented view with tissue overlay
5. **Navigate to details**: Click any sample card to view detailed analysis
6. **Filter samples**: Use the filter dropdown to sort by tissue composition (same as detail view)
7. **Pagination**: 
   - Navigate using Previous/Next buttons
   - Jump directly to any page using the page selector dropdown
   - Pagination controls available at both top and bottom of the page

## Learn More

### Next.js

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
