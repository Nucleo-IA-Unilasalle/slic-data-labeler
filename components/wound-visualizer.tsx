'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WoundData } from '@/lib/types/wound-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface WoundVisualizerProps {
  data: WoundData;
  scale?: number;
}

function bgrToRgb(bgr: number[]): { r: number; g: number; b: number } {
  return { r: bgr[2], g: bgr[1], b: bgr[0] };
}

interface ClusterScores {
  necrosis: number;
  slough: number;
  red_tissue: number;
}

export function WoundVisualizer({
  data,
  scale = 4,
}: WoundVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [viewMode, setViewMode] = useState<'segmented' | 'original'>('segmented');
  const [originalImageSrc, setOriginalImageSrc] = useState<string>('');
  const [reviewedScores, setReviewedScores] = useState<Record<number, ClusterScores>>({});

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Get click coordinates relative to canvas
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Convert from scaled display coordinates to actual pixel coordinates
    const pixelX = Math.floor(clickX / scale);
    const pixelY = Math.floor(clickY / scale);
    
    // Check bounds
    if (pixelX >= 0 && pixelX < data.image_dimensions.width &&
        pixelY >= 0 && pixelY < data.image_dimensions.height) {
      const clusterId = data.labels[pixelY][pixelX];
      
      // Select cluster if it exists
      if (clusterId >= 0) {
        setSelectedCluster(clusterId);
        const cluster = data.clusters.find((c) => c.cluster_id === clusterId);
        if (cluster) {
          console.log(`Selected Cluster ${clusterId} - Tissue Type: ${cluster.tissue_type}`);
        }
      }
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Get hover coordinates relative to canvas
    const hoverX = event.clientX - rect.left;
    const hoverY = event.clientY - rect.top;
    
    // Convert from scaled display coordinates to actual pixel coordinates
    const pixelX = Math.floor(hoverX / scale);
    const pixelY = Math.floor(hoverY / scale);
    
    // Check bounds
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

  const getCurrentScores = (clusterId: number): ClusterScores => {
    if (reviewedScores[clusterId]) {
      return reviewedScores[clusterId];
    }
    const cluster = data.clusters.find((c) => c.cluster_id === clusterId);
    return cluster?.scores || { necrosis: 0, slough: 0, red_tissue: 0 };
  };

  const updateScore = (clusterId: number, tissueType: keyof ClusterScores, value: number): void => {
    setReviewedScores((prev) => ({
      ...prev,
      [clusterId]: {
        ...getCurrentScores(clusterId),
        [tissueType]: value,
      },
    }));
  };

  const saveReview = async (): Promise<void> => {
    try {
      const reviewData = {
        image_filename: data.image_filename,
        reviewed_clusters: Object.entries(reviewedScores).map(([clusterId, scores]) => ({
          cluster_id: parseInt(clusterId),
          scores: scores,
        })),
      };

      const response = await fetch('/api/save-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reviewData),
      });

      if (!response.ok) {
        throw new Error('Failed to save review');
      }

      const result = await response.json();
      console.log('Review saved:', result);
      toast.success('Review saved successfully!');
    } catch (error) {
      console.error('Error saving review:', error);
      toast.error('Failed to save review');
    }
  };

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

  useEffect(() => {
    if (viewMode === 'original') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = data.image_dimensions;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Create image data
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
      // Create a map from cluster_id to cluster for fast lookup
      const clusterMap = new Map<number, typeof data.clusters[0]>();
      for (const cluster of data.clusters) {
        clusterMap.set(cluster.cluster_id, cluster);
      }

      // Draw overlay based on cluster predictions
      const currentImageData = ctx.getImageData(0, 0, width, height);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const label = data.labels[y][x];
          if (label < 0) continue; // Skip background

          // The label value directly corresponds to the cluster_id
          const cluster = clusterMap.get(label);
          if (!cluster) continue;

          // Blend colors based on all three tissue scores (BRY color space)
          const necrosisScore = Math.max(0, Math.min(1, cluster.scores.necrosis));
          const redScore = Math.max(0, Math.min(1, cluster.scores.red_tissue));
          const sloughScore = Math.max(0, Math.min(1, cluster.scores.slough));
          
          // Blend Black (0,0,0) + Red (255,0,0) + Yellow (255,255,0)
          const blendedColor = {
            r: redScore * 255 + sloughScore * 255,
            g: sloughScore * 255,
            b: 0,
          };
          
          // Use the maximum score as the overall certainty
          const maxScore = Math.max(necrosisScore, redScore, sloughScore);
          let alpha = maxScore * overlayOpacity;

          // Boost alpha for active cluster (hovered or selected)
          if (activeClusterId !== null && label === activeClusterId) {
            alpha = Math.min(1, alpha + 0.4);
          }

          const idx = (y * width + x) * 4;
          
          // Blend overlay color with original image
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
  }, [data, showOverlay, overlayOpacity, activeClusterId, viewMode]);

  const { width, height } = data.image_dimensions;

  const activeClusterData = useMemo(() => {
    if (activeClusterId === null) {
      return null;
    }
    return data.clusters.find((c) => c.cluster_id === activeClusterId) || null;
  }, [data.clusters, activeClusterId]);

  const rawColorAnalysis = useMemo(() => {
    const totalScores = {
      necrosis: 0,
      slough: 0,
      red_tissue: 0,
    };

    for (const cluster of data.clusters) {
      totalScores.necrosis += cluster.scores.necrosis;
      totalScores.slough += cluster.scores.slough;
      totalScores.red_tissue += cluster.scores.red_tissue;
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
  }, [data.clusters]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Wound Visualization</CardTitle>
            <CardDescription>
              {viewMode === 'segmented' 
                ? 'Segmented image with cluster prediction overlay'
                : 'Original unprocessed image'}
            </CardDescription>
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
                <Label htmlFor="view-mode-toggle" className="text-sm font-medium">
                  View Mode
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${viewMode === 'segmented' ? 'font-medium' : 'text-muted-foreground'}`}>
                    Segmented
                  </span>
                  <Switch
                    id="view-mode-toggle"
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
                    <Label htmlFor="overlay-toggle" className="text-sm font-medium">
                      Show Overlay
                    </Label>
                    <Switch
                      id="overlay-toggle"
                      checked={showOverlay}
                      onCheckedChange={setShowOverlay}
                    />
                  </div>
                  
                  {showOverlay && (
                    <div className="space-y-2">
                      <Label htmlFor="opacity-slider" className="text-sm font-medium">
                        Overlay Opacity: {Math.round(overlayOpacity * 100)}%
                      </Label>
                      <Slider
                        id="opacity-slider"
                        min={0}
                        max={1}
                        step={0.05}
                        value={[overlayOpacity]}
                        onValueChange={(values) => setOverlayOpacity(values[0])}
                      />
                    </div>
                  )}

                  {selectedCluster !== null && (
                    <div className="pt-4 border-t border-border space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Review Cluster {selectedCluster}</h3>
                        {Object.keys(reviewedScores).length > 0 && (
                          <Button size="sm" onClick={saveReview}>
                            Save Review
                          </Button>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-2">
                              <div className="w-3 h-3 bg-black border border-border rounded" />
                              Necrosis
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {(getCurrentScores(selectedCluster).necrosis * 100).toFixed(1)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={[getCurrentScores(selectedCluster).necrosis]}
                            onValueChange={(values) => updateScore(selectedCluster, 'necrosis', values[0])}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-2">
                              <div className="w-3 h-3 bg-yellow-400 rounded" />
                              Slough
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {(getCurrentScores(selectedCluster).slough * 100).toFixed(1)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={[getCurrentScores(selectedCluster).slough]}
                            onValueChange={(values) => updateScore(selectedCluster, 'slough', values[0])}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-2">
                              <div className="w-3 h-3 bg-red-600 rounded" />
                              Red Tissue
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {(getCurrentScores(selectedCluster).red_tissue * 100).toFixed(1)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={[getCurrentScores(selectedCluster).red_tissue]}
                            onValueChange={(values) => updateScore(selectedCluster, 'red_tissue', values[0])}
                          />
                        </div>
                      </div>
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
            <CardTitle>Tissue Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded" />
                <span className="text-sm">Red Tissue</span>
              </div>
              <span className="text-sm font-medium">
                {data.tissue_statistics.percentages.red_tissue.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400 rounded" />
                <span className="text-sm">Slough</span>
              </div>
              <span className="text-sm font-medium">
                {data.tissue_statistics.percentages.slough.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-black border border-border rounded" />
                <span className="text-sm">Necrosis</span>
              </div>
              <span className="text-sm font-medium">
                {data.tissue_statistics.percentages.necrosis.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Raw Color Analysis</CardTitle>
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
              {activeClusterData && (
                <>
                  <div
                    className="p-3 border border-border rounded-md bg-cyan-100 dark:bg-cyan-950 transition-colors cursor-pointer"
                    onMouseEnter={() => setHoveredCluster(activeClusterData.cluster_id)}
                    onMouseLeave={() => setHoveredCluster(null)}
                    onClick={() => setSelectedCluster(activeClusterData.cluster_id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">
                        Cluster {activeClusterData.cluster_id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activeClusterData.pixel_count} pixels
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-3 h-3 rounded"
                        style={{
                          backgroundColor: 
                            activeClusterData.tissue_type === 'red_tissue' ? '#dc2626' :
                            activeClusterData.tissue_type === 'slough' ? '#facc15' :
                            '#000000'
                        }}
                      />
                      <span className="text-sm capitalize">
                        {activeClusterData.tissue_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Necrosis:</span>
                        <span>{(activeClusterData.scores.necrosis * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Slough:</span>
                        <span>{(activeClusterData.scores.slough * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Red Tissue:</span>
                        <span>{(activeClusterData.scores.red_tissue * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border my-4" />
                </>
              )}
              
              {data.clusters.map((cluster) => (
                <div
                  key={cluster.cluster_id}
                  className={`p-3 border border-border rounded-md transition-colors cursor-pointer ${
                    activeClusterId === cluster.cluster_id
                      ? 'bg-cyan-100 dark:bg-cyan-950'
                      : 'hover:bg-accent'
                  }`}
                  onMouseEnter={() => setHoveredCluster(cluster.cluster_id)}
                  onMouseLeave={() => setHoveredCluster(null)}
                  onClick={() => setSelectedCluster(cluster.cluster_id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">
                      Cluster {cluster.cluster_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {cluster.pixel_count} pixels
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{
                        backgroundColor: 
                          cluster.tissue_type === 'red_tissue' ? '#dc2626' :
                          cluster.tissue_type === 'slough' ? '#facc15' :
                          '#000000'
                      }}
                    />
                    <span className="text-sm capitalize">
                      {cluster.tissue_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Necrosis:</span>
                      <span>{(cluster.scores.necrosis * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Slough:</span>
                      <span>{(cluster.scores.slough * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Red Tissue:</span>
                      <span>{(cluster.scores.red_tissue * 100).toFixed(1)}%</span>
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

