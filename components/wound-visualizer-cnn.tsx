'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WoundData } from '@/lib/types/wound-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CNNPrediction {
  cluster_id: number;
  original_scores: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
  predicted_scores: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
  tissue_type: 'necrosis' | 'slough' | 'red_tissue';
  pixel_count: number;
  center_y: number;
  center_x: number;
}

interface CNNPredictionData {
  image_filename: string;
  predictions: CNNPrediction[];
  tissue_statistics: {
    counts: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
    pixel_counts: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
    percentages: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
  };
}

interface WoundVisualizerCNNProps {
  data: WoundData;
  scale?: number;
}

function bgrToRgb(bgr: number[]): { r: number; g: number; b: number } {
  return { r: bgr[2], g: bgr[1], b: bgr[0] };
}

export function WoundVisualizerCNN({
  data,
  scale = 4,
}: WoundVisualizerCNNProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [viewMode, setViewMode] = useState<'segmented' | 'original'>('segmented');
  const [originalImageSrc, setOriginalImageSrc] = useState<string>('');
  const [predictions, setPredictions] = useState<CNNPredictionData | null>(null);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(true);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    async function loadOriginalImage() {
      try {
        const response = await fetch(`/api/original-image/${data.image_filename}`);
        if (!response.ok) {
          throw new Error('Failed to fetch original image');
        }
        const imageData = await response.json();
        setOriginalImageSrc(imageData.base64);
      } catch (error) {
        console.error(`Failed to load original image: ${data.image_filename}`, error);
      }
    }
    
    loadOriginalImage();
  }, [data.image_filename]);

  const loadPredictions = useCallback(async (forceRefresh: boolean = false): Promise<void> => {
    setIsLoadingPredictions(true);
    setPredictionError(null);
    setIsCached(false);
    
    try {
      const dataFilename = `data_${data.image_filename.replace('.png', '.json')}`;
      
      // If forcing refresh, delete cache first
      if (forceRefresh) {
        await fetch(`/api/cnn-predict/${dataFilename}`, {
          method: 'DELETE',
        });
      }
      
      const startTime = performance.now();
      const response = await fetch(`/api/cnn-predict/${dataFilename}`);
      const endTime = performance.now();
      
      // If response was very fast (< 100ms), it was likely cached
      const wasCached = (endTime - startTime) < 100;
      setIsCached(wasCached && !forceRefresh);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load predictions');
      }
      
      const predictionData = await response.json();
      setPredictions(predictionData);
      
      if (forceRefresh) {
        toast.success('Predictions refreshed');
      }
    } catch (error) {
      console.error('Failed to load CNN predictions:', error);
      setPredictionError(error instanceof Error ? error.message : 'Failed to load predictions');
      toast.error('Failed to load predictions');
    } finally {
      setIsLoadingPredictions(false);
    }
  }, [data.image_filename]);

  const handleRefresh = async (): Promise<void> => {
    setIsRefreshing(true);
    await loadPredictions(true);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadPredictions(false);
  }, [loadPredictions]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const pixelX = Math.floor(clickX / scale);
    const pixelY = Math.floor(clickY / scale);
    
    if (pixelX >= 0 && pixelX < data.image_dimensions.width &&
        pixelY >= 0 && pixelY < data.image_dimensions.height) {
      const clusterId = data.labels[pixelY][pixelX];
      
      if (clusterId >= 0) {
        setSelectedCluster(clusterId);
      }
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    const hoverX = event.clientX - rect.left;
    const hoverY = event.clientY - rect.top;
    
    const pixelX = Math.floor(hoverX / scale);
    const pixelY = Math.floor(hoverY / scale);
    
    if (pixelX >= 0 && pixelX < data.image_dimensions.width &&
        pixelY >= 0 && pixelY < data.image_dimensions.height) {
      const clusterId = data.labels[pixelY][pixelX];
      if (clusterId !== hoveredCluster) {
        setHoveredCluster(clusterId >= 0 ? clusterId : null);
      }
    } else {
      if (hoveredCluster !== null) {
        setHoveredCluster(null);
      }
    }
  };

  const handleCanvasMouseLeave = (): void => {
    setHoveredCluster(null);
  };

  const activeClusterId = hoveredCluster !== null ? hoveredCluster : selectedCluster;

  useEffect(() => {
    if (viewMode === 'original' || !predictions) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = data.image_dimensions;

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);

    // Draw segmented image
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bgr = data.img_bgr[y][x];
        const rgb = bgrToRgb(bgr);
        const idx = (y * width + x) * 4;
        imageData.data[idx] = rgb.r;
        imageData.data[idx + 1] = rgb.g;
        imageData.data[idx + 2] = rgb.b;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw overlay if enabled
    if (showOverlay) {
      const predictionMap = new Map<number, CNNPrediction>();
      for (const pred of predictions.predictions) {
        predictionMap.set(pred.cluster_id, pred);
      }

      const currentImageData = ctx.getImageData(0, 0, width, height);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const label = data.labels[y][x];
          if (label < 0) continue;

          const prediction = predictionMap.get(label);
          if (!prediction) continue;

          // Use CNN predicted scores instead of SLIC scores
          const necrosisScore = Math.max(0, Math.min(1, prediction.predicted_scores.necrosis));
          const redScore = Math.max(0, Math.min(1, prediction.predicted_scores.red_tissue));
          const sloughScore = Math.max(0, Math.min(1, prediction.predicted_scores.slough));
          
          const blendedColor = {
            r: redScore * 255 + sloughScore * 255,
            g: sloughScore * 255,
            b: 0,
          };
          
          const maxScore = Math.max(necrosisScore, redScore, sloughScore);
          let alpha = maxScore * overlayOpacity;

          if (activeClusterId !== null && label === activeClusterId) {
            alpha = Math.min(1, alpha + 0.4);
          }

          const idx = (y * width + x) * 4;
          
          currentImageData.data[idx] = Math.round(
            currentImageData.data[idx] * (1 - alpha) + blendedColor.r * alpha
          );
          currentImageData.data[idx + 1] = Math.round(
            currentImageData.data[idx + 1] * (1 - alpha) + blendedColor.g * alpha
          );
          currentImageData.data[idx + 2] = Math.round(
            currentImageData.data[idx + 2] * (1 - alpha) + blendedColor.b * alpha
          );
        }
      }

      ctx.putImageData(currentImageData, 0, 0);
    }
  }, [data, showOverlay, overlayOpacity, activeClusterId, viewMode, predictions]);

  const { width, height } = data.image_dimensions;

  const activePrediction = useMemo(() => {
    if (activeClusterId === null || !predictions) {
      return null;
    }
    return predictions.predictions.find((p) => p.cluster_id === activeClusterId) || null;
  }, [predictions, activeClusterId]);

  const rawColorAnalysis = useMemo(() => {
    if (!predictions) {
      return {
        scores: { necrosis: 0, slough: 0, red_tissue: 0 },
        percentages: { necrosis: 0, slough: 0, red_tissue: 0 },
      };
    }

    const totalScores = {
      necrosis: 0,
      slough: 0,
      red_tissue: 0,
    };

    for (const pred of predictions.predictions) {
      totalScores.necrosis += pred.predicted_scores.necrosis;
      totalScores.slough += pred.predicted_scores.slough;
      totalScores.red_tissue += pred.predicted_scores.red_tissue;
    }

    const sum = totalScores.necrosis + totalScores.slough + totalScores.red_tissue;

    return {
      scores: totalScores,
      percentages: {
        necrosis: sum > 0 ? (totalScores.necrosis / sum) * 100 : 0,
        slough: sum > 0 ? (totalScores.slough / sum) * 100 : 0,
        red_tissue: sum > 0 ? (totalScores.red_tissue / sum) * 100 : 0,
      },
    };
  }, [predictions]);

  if (isLoadingPredictions) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-muted-foreground">Running CNN inference...</p>
        </div>
      </div>
    );
  }

  if (predictionError) {
    return (
      <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-md">
        <p className="text-red-700 dark:text-red-300">Error: {predictionError}</p>
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">
          Make sure Python is installed with PyTorch, numpy, and opencv-python.
        </p>
      </div>
    );
  }

  if (!predictions) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CardTitle>Wound Visualization (CNN)</CardTitle>
                  <Badge variant="default" className="bg-purple-600">CNN Model</Badge>
                  {isCached && (
                    <Badge variant="secondary" className="text-xs">Cached</Badge>
                  )}
                </div>
                <CardDescription>
                  {viewMode === 'segmented' 
                    ? 'Segmented image with CNN prediction overlay'
                    : 'Original unprocessed image'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoadingPredictions}
                className="ml-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative inline-block overflow-x-scroll w-full">
              {viewMode === 'segmented' ? (
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  style={{
                    width: width * scale,
                    height: height * scale,
                    imageRendering: 'pixelated',
                    cursor: 'crosshair',
                  }}
                  className="border border-border rounded-lg shadow-lg"
                />
              ) : (
                <img
                  src={originalImageSrc}
                  alt="Original wound image"
                  style={{
                    width: '100%',
                    height: 'auto',
                    imageRendering: 'pixelated',
                  }}
                  className="border border-border rounded-lg shadow-lg"
                />
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="view-mode-toggle-cnn" className="text-sm font-medium">
                  View Mode
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${viewMode === 'segmented' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Segmented
                  </span>
                  <Switch
                    id="view-mode-toggle-cnn"
                    checked={viewMode === 'original'}
                    onCheckedChange={(checked) => setViewMode(checked ? 'original' : 'segmented')}
                  />
                  <span className={`text-xs ${viewMode === 'original' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Original
                  </span>
                </div>
              </div>
              
              {viewMode === 'segmented' && (
                <>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="overlay-toggle-cnn" className="text-sm font-medium">
                      Show Overlay
                    </Label>
                    <Switch
                      id="overlay-toggle-cnn"
                      checked={showOverlay}
                      onCheckedChange={setShowOverlay}
                    />
                  </div>
                  
                  {showOverlay && (
                    <div className="space-y-2">
                      <Label htmlFor="opacity-slider-cnn" className="text-sm font-medium">
                        Overlay Opacity: {Math.round(overlayOpacity * 100)}%
                      </Label>
                      <Slider
                        id="opacity-slider-cnn"
                        min={0}
                        max={1}
                        step={0.05}
                        value={[overlayOpacity]}
                        onValueChange={(values) => setOverlayOpacity(values[0])}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Image Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Dimensions</p>
                <p className="font-medium">{width} × {height}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Superpixels</p>
                <p className="font-medium">{data.num_superpixels}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Clusters</p>
                <p className="font-medium">{data.num_clusters_detected}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Processing Index</p>
                <p className="font-medium">{data.processing_index}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CNN Tissue Distribution</CardTitle>
            <CardDescription>Based on neural network predictions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded" />
                <span className="text-sm">Red Tissue</span>
              </div>
              <span className="text-sm font-medium">
                {predictions.tissue_statistics.percentages.red_tissue.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400 rounded" />
                <span className="text-sm">Slough</span>
              </div>
              <span className="text-sm font-medium">
                {predictions.tissue_statistics.percentages.slough.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-black border border-border rounded" />
                <span className="text-sm">Necrosis</span>
              </div>
              <span className="text-sm font-medium">
                {predictions.tissue_statistics.percentages.necrosis.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Raw CNN Analysis</CardTitle>
            <CardDescription>
              Summed activations across all clusters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded" />
                <span className="text-sm">Red Tissue</span>
              </div>
              <span className="text-sm font-medium">
                {rawColorAnalysis.percentages.red_tissue.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400 rounded" />
                <span className="text-sm">Slough</span>
              </div>
              <span className="text-sm font-medium">
                {rawColorAnalysis.percentages.slough.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-black border border-border rounded" />
                <span className="text-sm">Necrosis</span>
              </div>
              <span className="text-sm font-medium">
                {rawColorAnalysis.percentages.necrosis.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cluster Details</CardTitle>
            <CardDescription>
              Hover over clusters to highlight them
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activePrediction && (
                <>
                  <div
                    className="p-3 border border-border rounded-md bg-cyan-100 dark:bg-cyan-950 transition-colors cursor-pointer"
                    onMouseEnter={() => setHoveredCluster(activePrediction.cluster_id)}
                    onMouseLeave={() => setHoveredCluster(null)}
                    onClick={() => setSelectedCluster(activePrediction.cluster_id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">
                        Cluster {activePrediction.cluster_id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activePrediction.pixel_count} pixels
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-3 h-3 rounded"
                        style={{
                          backgroundColor: 
                            activePrediction.tissue_type === 'red_tissue' ? '#dc2626' :
                            activePrediction.tissue_type === 'slough' ? '#facc15' :
                            '#000000'
                        }}
                      />
                      <span className="text-sm capitalize">
                        {activePrediction.tissue_type.replace('_', ' ')}
                      </span>
                      <Badge variant="secondary" className="text-xs">CNN</Badge>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Necrosis:</span>
                        <span className="font-medium">{(activePrediction.predicted_scores.necrosis * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Slough:</span>
                        <span className="font-medium">{(activePrediction.predicted_scores.slough * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Red Tissue:</span>
                        <span className="font-medium">{(activePrediction.predicted_scores.red_tissue * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Original SLIC scores:</p>
                      <div className="text-xs space-y-1 text-muted-foreground opacity-70">
                        <div className="flex justify-between">
                          <span>Necrosis:</span>
                          <span>{(activePrediction.original_scores.necrosis * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Slough:</span>
                          <span>{(activePrediction.original_scores.slough * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Red Tissue:</span>
                          <span>{(activePrediction.original_scores.red_tissue * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border my-4" />
                </>
              )}
              
              {predictions.predictions.map((pred) => (
                <div
                  key={pred.cluster_id}
                  className={`p-3 border border-border rounded-md transition-colors cursor-pointer ${
                    activeClusterId === pred.cluster_id
                      ? 'bg-cyan-100 dark:bg-cyan-950'
                      : 'hover:bg-accent'
                  }`}
                  onMouseEnter={() => setHoveredCluster(pred.cluster_id)}
                  onMouseLeave={() => setHoveredCluster(null)}
                  onClick={() => setSelectedCluster(pred.cluster_id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">
                      Cluster {pred.cluster_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pred.pixel_count} pixels
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{
                        backgroundColor: 
                          pred.tissue_type === 'red_tissue' ? '#dc2626' :
                          pred.tissue_type === 'slough' ? '#facc15' :
                          '#000000'
                      }}
                    />
                    <span className="text-sm capitalize">
                      {pred.tissue_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Necrosis:</span>
                      <span>{(pred.predicted_scores.necrosis * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Slough:</span>
                      <span>{(pred.predicted_scores.slough * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Red Tissue:</span>
                      <span>{(pred.predicted_scores.red_tissue * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

