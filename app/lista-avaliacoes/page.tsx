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
  url: string;
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
  
  if (normalized === 'none' || normalized === 'nenhum' || normalized === 'não' || normalized === 'nao') {
    return 'bg-yellow-50 text-yellow-900 border-yellow-200';
  } else if (normalized === 'low' || normalized === 'baixo') {
    return 'bg-yellow-100 text-yellow-900 border-yellow-300';
  } else if (normalized === 'medium' || normalized === 'médio' || normalized === 'medio') {
    return 'bg-yellow-200 text-yellow-900 border-yellow-400';
  } else if (normalized === 'high' || normalized === 'alto') {
    return 'bg-yellow-400 text-yellow-950 border-yellow-600';
  }
  
  return 'bg-gray-100 text-gray-800 border-gray-300';
}

interface MobileCardProps {
  item: ReviewedItem;
  tableImages: Map<string, ImageData>;
  loadingImageSet: Set<string>;
  onImageClick: (item: ReviewedItem) => void;
  getAnnotator: (item: ReviewedItem) => string;
  getDominantTissue: (item: ReviewedItem) => string;
  getExudateLevel: (item: ReviewedItem) => string;
  loadImage: (imageFilename: string) => void;
}

function MobileCard({
  item,
  tableImages,
  loadingImageSet,
  onImageClick,
  getAnnotator,
  getDominantTissue,
  getExudateLevel,
  loadImage,
}: MobileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || hasLoadedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoadedRef.current) {
            hasLoadedRef.current = true;
            loadImage(item.image_filename);
            observer.unobserve(card);
          }
        });
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, [item.image_filename, loadImage]);

  const isLoading = loadingImageSet.has(item.image_filename);
  const imageData = tableImages.get(item.image_filename);

  return (
    <div
      ref={cardRef}
      onClick={() => onImageClick(item)}
      className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-4">
        <div className="relative w-20 h-20 bg-gray-200 rounded overflow-hidden flex-shrink-0">
          {imageData ? (
            <img
              src={imageData.url}
              alt={item.image_filename}
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-gray-600">Carregando...</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {getAnnotator(item)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant="outline" 
              className={`${getTissueBadgeStyle(getDominantTissue(item))} border text-xs`}
            >
              {getDominantTissue(item)}
            </Badge>
            <Badge 
              variant="outline" 
              className={`${getExudateBadgeStyle(getExudateLevel(item))} border text-xs`}
            >
              {getExudateLevel(item)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
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
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
        <div className="relative w-16 h-16 bg-gray-200 rounded overflow-hidden">
          {imageData ? (
            <img
              src={imageData.url}
              alt={item.image_filename}
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-gray-600">Carregando...</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-600">
        {getAnnotator(item)}
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
        <Badge 
          variant="outline" 
          className={`${getTissueBadgeStyle(getDominantTissue(item))} border text-xs sm:text-sm`}
        >
          {getDominantTissue(item)}
        </Badge>
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
        <Badge 
          variant="outline" 
          className={`${getExudateBadgeStyle(getExudateLevel(item))} border text-xs sm:text-sm`}
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

    loadedImagesRef.current.add(imageFilename);
    setTableImages((prev) => {
      const newMap = new Map(prev);
      newMap.set(imageFilename, { url: `/images_fuseg/${imageFilename}`, filename: imageFilename });
      return newMap;
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
    setImageData({ url: `/images_fuseg/${item.image_filename}`, filename: item.image_filename });
    setLoadingImage(false);
  }

  function closeModal(): void {
    setSelectedImage(null);
    setPredictions(null);
    setImageData(null);
  }

  function getAnnotator(item: ReviewedItem): string {
    return item.user || 'Revisor Manual';
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

    if (avgSlough < 0.3) return 'baixo';
    if (avgSlough < 0.5) return 'médio';
    return 'alto';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Lista de Avaliações</h1>
        </div>

        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-4">
          {reviewedData.map((item: ReviewedItem) => (
            <MobileCard
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
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Imagem
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Anotador
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Tecido Dominante
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Nível de Exsudato
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
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-2xl font-bold truncate pr-2">{selectedImage.image_filename}</h2>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold flex-shrink-0"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">Imagem</h3>
                  <div className="relative w-full aspect-square bg-gray-100 rounded flex items-center justify-center">
                    {loadingImage && (
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Carregando imagem...</p>
                      </div>
                    )}
                    {imageData && !loadingImage && (
                      <img
                        src={imageData.url}
                        alt={selectedImage.image_filename}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    )}
                    {!loadingImage && !imageData && (
                      <p className="text-sm text-gray-600">Falha ao carregar imagem</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">Revisão Manual</h3>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded mb-4">
                    <p className="mb-2 text-sm sm:text-base">
                      <span className="font-medium">Anotador:</span>{' '}
                      {selectedImage.user || 'N/A'}
                    </p>
                    {selectedImage.created_at && (
                      <p className="mb-2 text-xs text-gray-600">
                        <span className="font-medium">Data:</span>{' '}
                        {new Date(selectedImage.created_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                    <p className="mb-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm sm:text-base">
                      <span className="font-medium">Tecido Dominante:</span>{' '}
                      <Badge 
                        variant="outline" 
                        className={`${getTissueBadgeStyle(getDominantTissue(selectedImage))} border w-fit`}
                      >
                        {getDominantTissue(selectedImage)}
                      </Badge>
                    </p>
                    <p className="mb-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm sm:text-base">
                      <span className="font-medium">Nível de Exsudato:</span>{' '}
                      <Badge 
                        variant="outline" 
                        className={`${getExudateBadgeStyle(getExudateLevel(selectedImage))} border w-fit`}
                      >
                        {getExudateLevel(selectedImage)}
                      </Badge>
                    </p>
                    {selectedImage.obs && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm font-medium">Observações:</p>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
                          {selectedImage.obs}
                        </p>
                      </div>
                    )}
                  </div>

                  <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">Comparação de Predições</h3>
                  {loadingPredictions && (
                    <div className="text-center py-4 text-sm">Carregando predições...</div>
                  )}

                  {predictions && (
                    <div className="space-y-3 sm:space-y-4">
                      <div className="bg-blue-50 p-3 sm:p-4 rounded">
                        <h4 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base">Predição SLIC</h4>
                        {predictions.slic ? (
                          <div className="space-y-2">
                            <p className="text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="font-medium">Tipo de Tecido:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getTissueBadgeStyle(predictions.slic.tissue_type)} border w-fit`}
                              >
                                {predictions.slic.tissue_type}
                              </Badge>
                            </p>
                            <p className="text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="font-medium">Exsudato:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getExudateBadgeStyle(predictions.slic.qtd_exudado)} border w-fit`}
                              >
                                {predictions.slic.qtd_exudado}
                              </Badge>
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">Nenhuma predição disponível</p>
                        )}
                      </div>

                      <div className="bg-green-50 p-3 sm:p-4 rounded">
                        <h4 className="font-semibold text-green-900 mb-2 text-sm sm:text-base">Predição VLM</h4>
                        {predictions.vlm ? (
                          <div className="space-y-2">
                            <p className="text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="font-medium">Tipo de Tecido:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getTissueBadgeStyle(predictions.vlm.tissue_type)} border w-fit`}
                              >
                                {predictions.vlm.tissue_type}
                              </Badge>
                            </p>
                            <p className="text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="font-medium">Exsudato:</span>{' '}
                              <Badge 
                                variant="outline" 
                                className={`${getExudateBadgeStyle(predictions.vlm.qtd_exudado)} border w-fit`}
                              >
                                {predictions.vlm.qtd_exudado}
                              </Badge>
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">Nenhuma predição disponível</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

