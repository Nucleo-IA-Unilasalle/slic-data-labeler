'use client';

import { useState, useEffect } from 'react';

interface PredictionResult {
  image_path: string;
  is_dfu: boolean;
  probability: number;
  confidence: number;
}

interface SegmentationResult {
  image_path: string;
  original_width: number;
  original_height: number;
  mask: number[][];
  wound_pixels: number;
  total_pixels: number;
  wound_percentage: number;
}

export default function PipelineDemoPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setSegmentation(null);
      setMaskImageUrl(null);
      setError(null);
    }
  };

  useEffect(() => {
    if (segmentation && segmentation.mask) {
      createMaskImage(segmentation.mask, segmentation.original_width, segmentation.original_height);
    }
  }, [segmentation]);

  const createMaskImage = (mask: number[][], width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const imageData = ctx.createImageData(width, height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const maskValue = mask[y][x];
        
        if (maskValue > 0) {
          imageData.data[idx] = 255;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 180;
        } else {
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 0;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    setMaskImageUrl(canvas.toDataURL());
  };

  const handleUploadAndPredict = async () => {
    if (!selectedFile) {
      setError('Please select an image first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSegmentation(null);
    setMaskImageUrl(null);

    try {
      // Step 1: Upload the image
      setLoadingStep('Uploading image...');
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      const uploadData = await uploadResponse.json();
      const imagePath = uploadData.path;

      // Step 2: Run DFU detection
      setLoadingStep('Running DFU detection...');
      const inferenceResponse = await fetch('/api/pipeline/is-dfu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath }),
      });

      if (!inferenceResponse.ok) {
        throw new Error('Failed to run DFU detection');
      }

      const predictionData = await inferenceResponse.json();
      setResult(predictionData);

      // Step 3: If it's a DFU, run segmentation
      if (predictionData.is_dfu) {
        setLoadingStep('Running wound segmentation...');
        const segmentationResponse = await fetch('/api/pipeline/segmentation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imagePath }),
        });

        if (!segmentationResponse.ok) {
          throw new Error('Failed to run segmentation');
        }

        const segmentationData = await segmentationResponse.json();
        setSegmentation(segmentationData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const clearCache = async () => {
    if (!result) return;

    try {
      await fetch('/api/pipeline/is-dfu', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath: result.image_path }),
      });
      
      if (segmentation) {
        await fetch('/api/pipeline/segmentation', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imagePath: result.image_path }),
        });
      }
      
      setResult(null);
      setSegmentation(null);
      setMaskImageUrl(null);
      alert('Cache cleared successfully');
    } catch (err) {
      alert('Failed to clear cache');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          DFU Detection Pipeline Demo
        </h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Upload Image
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select an image file
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {previewUrl && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-md rounded-lg border border-gray-300"
                />
              </div>
            )}

            <button
              onClick={handleUploadAndPredict}
              disabled={!selectedFile || isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {isLoading ? loadingStep || 'Processing...' : 'Upload and Predict'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-semibold mb-1">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                DFU Detection Results
              </h2>
              <button
                onClick={clearCache}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Clear Cache
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <span className="text-gray-700 font-medium">Classification:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    result.is_dfu
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {result.is_dfu ? 'DFU Detected' : 'Not a DFU'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Probability</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(result.probability * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              
            </div>
          </div>
        )}

        {segmentation && maskImageUrl && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Wound Segmentation
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Original Image</p>
                <div className="relative border border-gray-300 rounded-lg overflow-hidden">
                  <img
                    src={previewUrl || ''}
                    alt="Original"
                    className="w-full h-auto"
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Segmentation Overlay</p>
                <div className="relative border border-gray-300 rounded-lg overflow-hidden">
                  <img
                    src={previewUrl || ''}
                    alt="Base"
                    className="w-full h-auto"
                  />
                  <img
                    src={maskImageUrl}
                    alt="Mask"
                    className="absolute top-0 left-0 w-full h-auto"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Wound Area</p>
                <p className="text-2xl font-bold text-gray-900">
                  {segmentation.wound_percentage.toFixed(2)}%
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Wound Pixels</p>
                <p className="text-2xl font-bold text-gray-900">
                  {segmentation.wound_pixels.toLocaleString()}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Image Size</p>
                <p className="text-2xl font-bold text-gray-900">
                  {segmentation.original_width}x{segmentation.original_height}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

