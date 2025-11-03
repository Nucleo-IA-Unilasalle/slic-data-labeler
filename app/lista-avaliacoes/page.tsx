'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';

interface ReviewedCluster {
  cluster_id: number;
  scores: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
}

interface ReviewedItem {
  filename: string;
  image_filename: string;
  clusters_count: number;
  reviewed_clusters: ReviewedCluster[];
  user?: string;
  qtd_exudado?: string;
  tissue_type?: string;
  obs?: string;
  created_at?: string;
}

interface ImageData {
  base64: string;
  filename: string;
}

interface PredictionData {
  image_name: string;
  qtd_exudado: string;
  tissue_type: string;
}

interface CSVPredictions {
  slic: PredictionData | null;
  vlm: PredictionData | null;
}

interface TableRowProps {
  item: ReviewedItem;
  tableImages: Map<string, ImageData>;
  loadingImageSet: Set<string>;
  onImageClick: (item: ReviewedItem) => void;
  getAnnotator: (item: ReviewedItem) => string;
  getDominantTissue: (item: ReviewedItem) => string;
  getExudateLevel: (item: ReviewedItem) => string;
  loadImage: (imageFilename: string) => void;
}

function getTissueBadgeStyle(tissueType: string): string {
  const normalized = tissueType.toLowerCase().trim();
  
  if (normalized === 'epitelial' || normalized === 'epithelial') {
    return 'bg-pink-100 text-pink-800 border-pink-300';
  } else if (normalized === 'granulação' || normalized === 'granulacao') {
    return 'bg-red-100 text-red-800 border-red-300';
  } else if (normalized === 'esfacelo') {
    return 'bg-yellow-100 text-yellow-900 border-yellow-400';
  } else if (normalized === 'necrotic' || normalized === 'necrotico') {
    return 'bg-black text-white border-gray-800';
  }
  
  return 'bg-gray-100 text-gray-800 border-gray-300';
}

function getExudateBadgeStyle(exudateLevel: string): string {
  const normalized = exudateLevel.toLowerCase().trim();
  
  if (normalized === 'none') {
    return 'bg-yellow-50 text-yellow-900 border-yellow-200';
  } else if (normalized === 'low') {
    return 'bg-yellow-100 text-yellow-900 border-yellow-300';
  } else if (normalized === 'medium') {
    return 'bg-yellow-200 text-yellow-900 border-yellow-400';
  } else if (normalized === 'high') {
    return 'bg-yellow-400 text-yellow-950 border-yellow-600';
  }
  
  return 'bg-gray-100 text-gray-800 border-gray-300';
}

function TableRow({
  item,
  tableImages,
  loadingImageSet,
  onImageClick,
  getAnnotator,
  getDominantTissue,
  getExudateLevel,
  loadImage,
}: TableRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const hasLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || hasLoadedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoadedRef.current) {
            hasLoadedRef.current = true;
            loadImage(item.image_filename);
            observer.unobserve(row);
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before the element is visible
        threshold: 0.1,
      }
    );

    observer.observe(row);

    return () => {
      observer.disconnect();
    };
  }, [item.image_filename, loadImage]);

  const isLoading = loadingImageSet.has(item.image_filename);
  const imageData = tableImages.get(item.image_filename);

  return (
    <tr
      ref={rowRef}
      className="hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={() => onImageClick(item)}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="relative w-16 h-16 bg-gray-200 rounded overflow-hidden">
          {imageData ? (
            <img
              src={imageData.base64}
              alt={item.image_filename}
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-gray-600">Loading...</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
        {getAnnotator(item)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge 
          variant="outline" 
          className={`${getTissueBadgeStyle(getDominantTissue(item))} border`}
        >
          {getDominantTissue(item)}
        </Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge 
          variant="outline" 
          className={`${getExudateBadgeStyle(getExudateLevel(item))} border`}
        >
          {getExudateLevel(item)}
        </Badge>
      </td>
    </tr>
  );
}

export default function ListaAvaliacoesPage() {
  const [reviewedData, setReviewedData] = useState<ReviewedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedImage, setSelectedImage] = useState<ReviewedItem | null>(null);
  const [predictions, setPredictions] = useState<CSVPredictions | null>(null);
  const [loadingPredictions, setLoadingPredictions] = useState<boolean>(false);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [tableImages, setTableImages] = useState<Map<string, ImageData>>(new Map());
  const [loadingImageSet, setLoadingImageSet] = useState<Set<string>>(new Set());
  const loadedImagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchReviewedData();
  }, []);

  async function fetchReviewedData(): Promise<void> {
    try {
      const response = await fetch('/api/supervision/reviewed-list');
      const data = await response.json();
      setReviewedData(data);
    } catch (error) {
      console.error('Failed to load reviewed data:', error);
    } finally {
      setLoading(false);
    }
  }

  const loadImage = useCallback(async (imageFilename: string): Promise<void> => {
    // Skip if already loaded
    if (loadedImagesRef.current.has(imageFilename)) {
      return;
    }

    // Skip if currently loading (check with functional update)
    setLoadingImageSet((currentLoading) => {
      if (currentLoading.has(imageFilename)) {
        return currentLoading;
      }

      // Mark as loading
      const newLoading = new Set(currentLoading);
      newLoading.add(imageFilename);

      // Load the image
      fetch(`/api/original-image/${encodeURIComponent(imageFilename)}`)
        .then((response) => response.json())
        .then((data) => {
          loadedImagesRef.current.add(imageFilename);
          setTableImages((prev) => {
            const newMap = new Map(prev);
            newMap.set(imageFilename, data);
            return newMap;
          });
        })
        .catch((error) => {
          console.error(`Failed to load image ${imageFilename}:`, error);
        })
        .finally(() => {
          setLoadingImageSet((prev) => {
            const newSet = new Set(prev);
            newSet.delete(imageFilename);
            return newSet;
          });
        });

      return newLoading;
    });
  }, []);

  async function handleImageClick(item: ReviewedItem): Promise<void> {
    setSelectedImage(item);
    setLoadingPredictions(true);
    setPredictions(null);
    setImageData(null);
    setLoadingImage(true);

    // Load predictions
    try {
      const response = await fetch(
        `/api/supervision/predictions?imageName=${encodeURIComponent(item.image_filename)}`
      );
      const data = await response.json();
      setPredictions(data);
    } catch (error) {
      console.error('Failed to load predictions:', error);
    } finally {
      setLoadingPredictions(false);
    }

    // Load image data
    try {
      const response = await fetch(`/api/original-image/${encodeURIComponent(item.image_filename)}`);
      const data = await response.json();
      setImageData(data);
    } catch (error) {
      console.error('Failed to load image:', error);
    } finally {
      setLoadingImage(false);
    }
  }

  function closeModal(): void {
    setSelectedImage(null);
    setPredictions(null);
    setImageData(null);
  }

  function getAnnotator(item: ReviewedItem): string {
    return item.user || 'Manual Reviewer';
  }

  function getDominantTissue(item: ReviewedItem): string {
    if (item.tissue_type) {
      // Normalize tissue type names
      const normalized = item.tissue_type.toLowerCase().trim();
      if (normalized === 'necrotico') {
        return 'necrotic';
      }
      return item.tissue_type;
    }
    
    const clusters = item.reviewed_clusters;
    let totalNecrosis = 0;
    let totalSlough = 0;
    let totalRedTissue = 0;

    clusters.forEach((cluster: ReviewedCluster) => {
      totalNecrosis += cluster.scores.necrosis;
      totalSlough += cluster.scores.slough;
      totalRedTissue += cluster.scores.red_tissue;
    });

    const avgNecrosis = totalNecrosis / clusters.length;
    const avgSlough = totalSlough / clusters.length;
    const avgRedTissue = totalRedTissue / clusters.length;

    if (avgNecrosis > avgSlough && avgNecrosis > avgRedTissue) {
      return 'necrotic';
    } else if (avgSlough > avgRedTissue) {
      return 'esfacelo';
    } else {
      return 'granulação';
    }
  }

  function getExudateLevel(item: ReviewedItem): string {
    if (item.qtd_exudado) {
      return item.qtd_exudado;
    }
    
    const clusters = item.reviewed_clusters;
    const avgSlough = clusters.reduce(
      (sum: number, cluster: ReviewedCluster) => sum + cluster.scores.slough,
      0
    ) / clusters.length;

    if (avgSlough < 0.3) return 'low';
    if (avgSlough < 0.5) return 'medium';
    return 'high';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Lista de Avaliações</h1>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Annotator
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Dominant Tissue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Exudate Level
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reviewedData.map((item: ReviewedItem) => (
                <TableRow
                  key={item.filename}
                  item={item}
                  tableImages={tableImages}
                  loadingImageSet={loadingImageSet}
                  onImageClick={handleImageClick}
                  getAnnotator={getAnnotator}
                  getDominantTissue={getDominantTissue}
                  getExudateLevel={getExudateLevel}
                  loadImage={loadImage}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{selectedImage.image_filename}</h2>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Image</h3>
                  <div className="relative w-full aspect-square bg-gray-100 rounded flex items-center justify-center">
                    {loadingImage && (
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading image...</p>
                      </div>
                    )}
                    {imageData && !loadingImage && (
                      <img
                        src={imageData.base64}
                        alt={selectedImage.image_filename}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    )}
                    {!loadingImage && !imageData && (
                      <p className="text-sm text-gray-600">Failed to load image</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Manual Review</h3>
                  <div className="bg-gray-50 p-4 rounded mb-4">
                    <p className="mb-2">
                      <span className="font-medium">Annotator:</span>{' '}
                      {selectedImage.user || 'N/A'}
                    </p>
                    {selectedImage.created_at && (
                      <p className="mb-2 text-xs text-gray-600">
                        <span className="font-medium">Date:</span>{' '}
                        {new Date(selectedImage.created_at).toLocaleString()}
                      </p>
                    )}
                    <p className="mb-2 flex items-center gap-2">
                      <span className="font-medium">Dominant Tissue:</span>{' '}
                      <Badge 
                        variant="outline" 
                        className={`${getTissueBadgeStyle(getDominantTissue(selectedImage))} border`}
                      >
                        {getDominantTissue(selectedImage)}
                      </Badge>
                    </p>
                    <p className="mb-2 flex items-center gap-2">
                      <span className="font-medium">Exudate Level:</span>{' '}
                      <Badge 
                        variant="outline" 
                        className={`${getExudateBadgeStyle(getExudateLevel(selectedImage))} border`}
                      >
                        {getExudateLevel(selectedImage)}
                      </Badge>
                    </p>
                    {selectedImage.obs && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm">
                          <span className="font-medium">Observations:</span>
                        </p>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                          {selectedImage.obs}
                        </p>
                      </div>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold mb-3">Predictions Comparison</h3>
                  {loadingPredictions && (
                    <div className="text-center py-4">Loading predictions...</div>
                  )}

                  {predictions && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 p-4 rounded">
                        <h4 className="font-semibold text-blue-900 mb-2">SLIC Prediction</h4>
                        {predictions.slic ? (
                          <div className="space-y-2">
                            <p className="text-sm flex items-center gap-2">
                              <span className="font-medium">Tissue Type:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getTissueBadgeStyle(predictions.slic.tissue_type)} border`}
                              >
                                {predictions.slic.tissue_type}
                              </Badge>
                            </p>
                            <p className="text-sm flex items-center gap-2">
                              <span className="font-medium">Exudate:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getExudateBadgeStyle(predictions.slic.qtd_exudado)} border`}
                              >
                                {predictions.slic.qtd_exudado}
                              </Badge>
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">No prediction available</p>
                        )}
                      </div>

                      <div className="bg-green-50 p-4 rounded">
                        <h4 className="font-semibold text-green-900 mb-2">VLM Prediction</h4>
                        {predictions.vlm ? (
                          <div className="space-y-2">
                            <p className="text-sm flex items-center gap-2">
                              <span className="font-medium">Tissue Type:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getTissueBadgeStyle(predictions.vlm.tissue_type)} border`}
                              >
                                {predictions.vlm.tissue_type}
                              </Badge>
                            </p>
                            <p className="text-sm flex items-center gap-2">
                              <span className="font-medium">Exudate:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getExudateBadgeStyle(predictions.vlm.qtd_exudado)} border`}
                              >
                                {predictions.vlm.qtd_exudado}
                              </Badge>
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">No prediction available</p>
                        )}
                      </div>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold mb-3 mt-6">Cluster Details</h3>
                  <div className="bg-gray-50 p-4 rounded max-h-64 overflow-y-auto">
                    {selectedImage.reviewed_clusters.map((cluster: ReviewedCluster) => (
                      <div key={cluster.cluster_id} className="mb-3 pb-3 border-b last:border-b-0">
                        <p className="font-medium text-sm mb-1">Cluster {cluster.cluster_id}</p>
                        <div className="text-xs space-y-1">
                          <p>Necrosis: {cluster.scores.necrosis.toFixed(3)}</p>
                          <p>Slough: {cluster.scores.slough.toFixed(3)}</p>
                          <p>Red Tissue: {cluster.scores.red_tissue.toFixed(3)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

