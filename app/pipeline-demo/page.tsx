'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface PredictionResult {
  is_dfu: boolean;
  logit: number;
}

interface SegmentationResult {
  mask: number[][];
  original_width: number;
  original_height: number;
  wound_pixels: number;
  total_pixels: number;
  wound_percentage: number;
}

interface TissueResult {
  xgboost_slough_amount: string;
  xgboost_tissue_type: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function PipelineDemoPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [tissueResult, setTissueResult] = useState<TissueResult | null>(null);
  const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [forceContinue, setForceContinue] = useState<boolean>(false);

  useEffect(() => {
    fetchActiveApiUrl();
  }, []);

  const fetchActiveApiUrl = async () => {
    try {
      const { data, error } = await supabase
        .from('api_instances')
        .select('url')
        .eq('active', true)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        throw new Error(`Failed to fetch API URL: ${error.message}`);
      }

      if (data) {
        setApiUrl(data.url);
        console.log('Active API URL:', data.url);
      } else {
        setError('No active API instance found');
      }
    } catch (err) {
      console.error('Error fetching API URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch API URL');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setSegmentation(null);
      setTissueResult(null);
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

    if (!apiUrl) {
      setError('No active API instance available. Please try again.');
      await fetchActiveApiUrl();
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSegmentation(null);
    setTissueResult(null);
    setMaskImageUrl(null);

    try {
      // Step 1: Convert image to base64
      setLoadingStep('Converting image...');
      const base64Image = await fileToBase64(selectedFile);

      // Step 2: Run DFU detection
      setLoadingStep('Running DFU detection...');
      const inferenceResponse = await fetch(`${apiUrl}/is-dfu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!inferenceResponse.ok) {
        throw new Error('Failed to run DFU detection');
      }

      const predictionData: PredictionResult = await inferenceResponse.json();
      setResult(predictionData);

      // Step 3: If it's a DFU (or force continue is enabled), run segmentation
      if (predictionData.is_dfu || forceContinue) {
        setLoadingStep('Running wound segmentation...');
        const segmentationResponse = await fetch(`${apiUrl}/segmentation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: base64Image }),
        });

        if (!segmentationResponse.ok) {
          throw new Error('Failed to run segmentation');
        }

        const segmentationData: SegmentationResult = await segmentationResponse.json();
        setSegmentation(segmentationData);

        // Step 4: Run tissue classification (using mask from segmentation)
        setLoadingStep('Running tissue classification...');
        const tissueResponse = await fetch(`${apiUrl}/tissue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            image: base64Image,
            mask: segmentationData.mask
          }),
        });

        if (!tissueResponse.ok) {
          throw new Error('Failed to run tissue classification');
        }

        const tissueData: TissueResult = await tissueResponse.json();
        setTissueResult(tissueData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const clearResults = () => {
    setResult(null);
    setSegmentation(null);
    setTissueResult(null);
    setMaskImageUrl(null);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const getTissueColor = (tissueType: string | undefined | null): string => {
    if (!tissueType) {
      return 'bg-gray-100 text-gray-800';
    }
    const colors: { [key: string]: string } = {
      'granulação': 'bg-red-100 text-red-800',
      'esfacelo': 'bg-yellow-100 text-yellow-800',
      'necrotic': 'bg-gray-800 text-white',
      'epitelial': 'bg-pink-100 text-pink-800',
    };
    return colors[tissueType.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const getExudateColor = (exudateLevel: string | undefined | null): string => {
    if (!exudateLevel) {
      return 'bg-gray-100 text-gray-800';
    }
    const colors: { [key: string]: string } = {
      'none': 'bg-green-100 text-green-800',
      'low': 'bg-blue-100 text-blue-800',
      'medium': 'bg-orange-100 text-orange-800',
      'high': 'bg-red-100 text-red-800',
    };
    return colors[exudateLevel.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          DFU Detection Pipeline Demo
        </h1>

        {apiUrl && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Active API:</span> {apiUrl}
            </p>
          </div>
        )}

        {!apiUrl && !error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              Loading API instance...
            </p>
          </div>
        )}

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

            <div className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                id="forceContinue"
                checked={forceContinue}
                onChange={(e) => setForceContinue(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="forceContinue" className="text-sm text-gray-700">
                Force continue pipeline even if not DFU
              </label>
            </div>

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
                onClick={clearResults}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Clear Results
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
                {!result.is_dfu && forceContinue && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                    Pipeline forced to continue
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Logit Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {result.logit.toFixed(4)}
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

        {tissueResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Tissue Classification
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-gray-700 font-medium">Tissue Type:</span>
                </div>
                <div className={`px-4 py-3 rounded-lg text-center font-semibold text-lg ${getTissueColor(tissueResult.xgboost_tissue_type)}`}>
                  {tissueResult.xgboost_tissue_type || 'Unknown'}
                </div>
              </div>

              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-gray-700 font-medium">Exudate Amount:</span>
                </div>
                <div className={`px-4 py-3 rounded-lg text-center font-semibold text-lg ${getExudateColor(tissueResult.xgboost_slough_amount)}`}>
                  {tissueResult.xgboost_slough_amount || 'Unknown'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

