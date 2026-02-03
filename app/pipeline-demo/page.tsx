'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Camera, Loader2 } from 'lucide-react';

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
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [tissueResult, setTissueResult] = useState<TissueResult | null>(null);
  const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const segmentationRef = useRef<HTMLDivElement>(null);
  const tissueResultRef = useRef<HTMLDivElement>(null);
  const pushScaleRef = useRef<HTMLDivElement>(null);

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
        throw new Error(`Falha ao buscar URL da API: ${error.message}`);
      }

      if (data) {
        setApiUrl(data.url);
        console.log('Active API URL:', data.url);
      } else {
        setError('Nenhuma instância de API ativa encontrada');
      }
    } catch (err) {
      console.error('Error fetching API URL:', err);
      setError(err instanceof Error ? err.message : 'Falha ao buscar URL da API');
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

  useEffect(() => {
    if (segmentation && maskImageUrl && segmentationRef.current) {
      setTimeout(() => {
        segmentationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [segmentation, maskImageUrl]);

  useEffect(() => {
    if (tissueResult && tissueResultRef.current) {
      setTimeout(() => {
        tissueResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [tissueResult]);

  useEffect(() => {
    if (segmentation && (tissueResult || segmentation.wound_percentage === 0) && pushScaleRef.current) {
      setTimeout(() => {
        pushScaleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [segmentation, tissueResult]);

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
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 255;
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
      setError('Por favor, selecione uma imagem primeiro');
      return;
    }

    if (!apiUrl) {
      setError('Nenhuma instância de API ativa disponível. Por favor, tente novamente.');
      await fetchActiveApiUrl();
      return;
    }

    setIsLoading(true);
    setError(null);
    setSegmentation(null);
    setTissueResult(null);
    setMaskImageUrl(null);

    try {
      // Step 1: Convert image to base64
      setLoadingStep('Convertendo imagem...');
      const base64Image = await fileToBase64(selectedFile);

      // Step 2: Run segmentation
      setLoadingStep('Executando segmentação da ferida...');
      const segmentationResponse = await fetch(`${apiUrl}/segmentation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!segmentationResponse.ok) {
        throw new Error('Falha ao executar segmentação');
      }

      const segmentationData: SegmentationResult = await segmentationResponse.json();
      setSegmentation(segmentationData);

      // Step 3: Run tissue classification only if wound area > 0%
      if (segmentationData.wound_percentage > 0) {
        setLoadingStep('Executando classificação de tecido...');
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
          throw new Error('Falha ao executar classificação de tecido');
        }

        const tissueData: TissueResult = await tissueResponse.json();
        setTissueResult(tissueData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ocorreu');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const clearResults = () => {
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
      'none': 'bg-gray-100 text-gray-800',
      'low': 'bg-yellow-100 text-yellow-800',
      'medium': 'bg-amber-100 text-amber-800',
      'high': 'bg-orange-100 text-orange-800',
    };
    return colors[exudateLevel.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const getPushExudateScore = (exudateLevel: string | undefined | null): number => {
    if (!exudateLevel) return -1;
    const mapping: { [key: string]: number } = {
      'none': 0,
      'low': 1,
      'medium': 2,
      'high': 3,
    };
    return mapping[exudateLevel.toLowerCase()] ?? -1;
  };

  const getPushTissueScore = (tissueType: string | undefined | null, woundPercentage: number): number => {
    if (woundPercentage === 0) return 0;
    if (!tissueType) return -1;
    const mapping: { [key: string]: number } = {
      'epitelial': 1,
      'granulação': 2,
      'esfacelo': 3,
      'necrotic': 4,
    };
    return mapping[tissueType.toLowerCase()] ?? -1;
  };

  const getExudateLevelFromScore = (score: number): string | null => {
    const mapping: { [key: number]: string } = {
      0: 'none',
      1: 'low',
      2: 'medium',
      3: 'high',
    };
    return mapping[score] ?? null;
  };

  const getTissueTypeFromScore = (score: number): string | null => {
    const mapping: { [key: number]: string | null } = {
      0: null,
      1: 'epitelial',
      2: 'granulação',
      3: 'esfacelo',
      4: 'necrotic',
    };
    return mapping[score] ?? null;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Mobile Version */}
      <div className="block md:hidden h-screen w-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 shadow-md">
          <h1 className="text-lg font-bold">Detecção de Feridas</h1>
          {apiUrl && (
            <p className="text-xs mt-1 opacity-90">API Ativa</p>
          )}
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded">
              <p className="text-sm text-red-800 font-medium">Erro</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {!apiUrl && !error && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mb-4 rounded">
              <p className="text-sm text-yellow-800">Carregando API...</p>
            </div>
          )}

          {/* Image Preview */}
          {previewUrl ? (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-gray-800">Imagem</h2>
                {!isLoading && (
                  <button
                    onClick={clearResults}
                    className="text-xs text-blue-600 font-medium"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <img
                src={previewUrl}
                alt="Imagem selecionada"
                className="w-full rounded-lg border border-gray-200"
              />
              {!isLoading && !segmentation && (
                <button
                  onClick={handleUploadAndPredict}
                  disabled={!selectedFile}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium mt-3 active:bg-blue-700 disabled:bg-gray-400"
                >
                  Analisar Imagem
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-6 mb-4 text-center">
              <Camera className="h-16 w-16 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Toque no botão da câmera abaixo para capturar ou selecionar uma imagem
              </p>
            </div>
          )}

          {/* Loading Progress */}
          {isLoading && loadingStep && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded">
              <div className="flex items-center space-x-3">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-800 font-medium">{loadingStep}</p>
              </div>
            </div>
          )}

          {/* Segmentation Results */}
          {segmentation && maskImageUrl && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Segmentação da Ferida
              </h2>

              {/* Image Comparison */}
              <div className="space-y-4 mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Original</p>
                  <img
                    src={previewUrl || ''}
                    alt="Original"
                    className="w-full rounded-lg border border-gray-200"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Segmentação</p>
                  <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={previewUrl || ''}
                      alt="Base"
                      className="w-full"
                    />
                    <img
                      src={maskImageUrl}
                      alt="Máscara"
                      className="absolute top-0 left-0 w-full"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Área da Ferida</p>
                  <p className="text-xl font-bold text-gray-900">
                    {segmentation.wound_percentage.toFixed(2)}%
                  </p>
                  {segmentation.wound_percentage === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Nenhuma ferida detectada
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-1">Pixels</p>
                    <p className="text-base font-bold text-gray-900">
                      {segmentation.wound_pixels.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-1">Tamanho</p>
                    <p className="text-base font-bold text-gray-900">
                      {segmentation.original_width}x{segmentation.original_height}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tissue Classification Results */}
          {tissueResult && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Classificação de Tecido
              </h2>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Tipo de Tecido</p>
                  <div className={`px-4 py-3 rounded-lg text-center font-semibold ${getTissueColor(tissueResult.xgboost_tissue_type)}`}>
                    {tissueResult.xgboost_tissue_type || 'Desconhecido'}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Exsudato</p>
                  <div className={`px-4 py-3 rounded-lg text-center font-semibold ${getExudateColor(tissueResult.xgboost_slough_amount)}`}>
                    {tissueResult.xgboost_slough_amount || 'Desconhecido'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PUSH Scale */}
          {segmentation && (tissueResult || segmentation.wound_percentage === 0) && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Escala PUSH
              </h2>

              {/* Exudate Amount */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Quantidade de Exsudato</p>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { score: 0, label: 'Ausente' },
                    { score: 1, label: 'Pequena' },
                    { score: 2, label: 'Moderada' },
                    { score: 3, label: 'Grande' },
                  ].map((item) => {
                    const exudateScore = getPushExudateScore(tissueResult?.xgboost_slough_amount);
                    const isHighlighted = exudateScore === item.score;
                    const exudateLevel = getExudateLevelFromScore(item.score);
                    const colorClasses = getExudateColor(exudateLevel);
                    return (
                      <div
                        key={item.score}
                        className={`border border-gray-300 p-2 rounded text-center ${
                          isHighlighted
                            ? `${colorClasses} font-bold border-2 border-gray-800`
                            : 'bg-white text-gray-700'
                        }`}
                      >
                        <div className="text-lg font-bold">{item.score}</div>
                        <div className="text-xs mt-1">{item.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tissue Type */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Tipo de Tecido</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { score: 0, label: 'Ferida Fechada' },
                    { score: 1, label: 'Epitelial' },
                    { score: 2, label: 'Granulação' },
                    { score: 3, label: 'Esfacelo' },
                    { score: 4, label: 'Necrótico' },
                  ].map((item) => {
                    const tissueScore = getPushTissueScore(
                      tissueResult?.xgboost_tissue_type,
                      segmentation.wound_percentage
                    );
                    const isHighlighted = tissueScore === item.score;
                    const tissueType = getTissueTypeFromScore(item.score);
                    const colorClasses = getTissueColor(tissueType);
                    return (
                      <div
                        key={item.score}
                        className={`border border-gray-300 p-2 rounded text-center ${
                          isHighlighted
                            ? `${colorClasses} font-bold border-2 border-gray-800`
                            : 'bg-white text-gray-700'
                        }`}
                      >
                        <div className="text-lg font-bold">{item.score}</div>
                        <div className="text-xs mt-1">{item.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                <span className="font-semibold">Nota:</span> A célula destacada indica o valor detectado
              </p>
            </div>
          )}
        </div>

        {/* Bottom Camera Button - Fixed */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          {isLoading ? (
            <div className="flex items-center justify-center p-4 rounded-full h-14 w-14 bg-blue-500 mx-auto shadow-lg">
              <Loader2 className="h-7 w-7 text-white animate-spin" />
            </div>
          ) : (
            <button
              onClick={handleCameraClick}
              className="flex items-center justify-center p-4 rounded-full h-14 w-14 bg-blue-500 active:bg-blue-600 mx-auto shadow-lg"
            >
              <Camera className="h-7 w-7 text-white" />
            </button>
          )}
        </div>
      </div>
      <div className="hidden md:block min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Demonstração do Pipeline de Detecção de DFU
          </h1>

          {apiUrl && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">API Ativa:</span> {apiUrl}
              </p>
            </div>
          )}

          {!apiUrl && !error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800">
                Carregando instância da API...
              </p>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Enviar Imagem
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selecione um arquivo de imagem
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
                  <p className="text-sm font-medium text-gray-700 mb-2">Pré-visualização:</p>
                  <img
                    src={previewUrl}
                    alt="Pré-visualização"
                    className="max-w-md rounded-lg border border-gray-300"
                  />
                </div>
              )}

              <button
                onClick={handleUploadAndPredict}
                disabled={!selectedFile || isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isLoading ? loadingStep || 'Processando...' : 'Enviar e Prever'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-red-800 font-semibold mb-1">Erro</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {segmentation && maskImageUrl && (
            <div ref={segmentationRef} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Segmentação da Ferida
                </h2>
                <button
                  onClick={clearResults}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Limpar Resultados
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Imagem Original</p>
                  <div className="relative border border-gray-300 rounded-lg overflow-hidden">
                    <img
                      src={previewUrl || ''}
                      alt="Original"
                      className="w-full h-auto"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Sobreposição de Segmentação</p>
                  <div className="relative border border-gray-300 rounded-lg overflow-hidden">
                    <img
                      src={previewUrl || ''}
                      alt="Base"
                      className="w-full h-auto"
                    />
                    <img
                      src={maskImageUrl}
                      alt="Máscara"
                      className="absolute top-0 left-0 w-full h-auto"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Área da Ferida</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation.wound_percentage.toFixed(2)}%
                  </p>
                  {segmentation.wound_percentage === 0 && (
                    <p className="text-xs text-yellow-600 mt-2">
                      Nenhuma ferida detectada. Pipeline interrompido.
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Pixels da Ferida</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation.wound_pixels.toLocaleString()}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Tamanho da Imagem</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation.original_width}x{segmentation.original_height}
                  </p>
                </div>
              </div>
            </div>
          )}

          {tissueResult && (
            <div ref={tissueResultRef} className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Classificação de Tecido
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-gray-700 font-medium">Tipo de Tecido:</span>
                  </div>
                  <div className={`px-4 py-3 rounded-lg text-center font-semibold text-lg ${getTissueColor(tissueResult.xgboost_tissue_type)}`}>
                    {tissueResult.xgboost_tissue_type || 'Desconhecido'}
                  </div>
                </div>

                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-gray-700 font-medium">Quantidade de Exsudato:</span>
                  </div>
                  <div className={`px-4 py-3 rounded-lg text-center font-semibold text-lg ${getExudateColor(tissueResult.xgboost_slough_amount)}`}>
                    {tissueResult.xgboost_slough_amount || 'Desconhecido'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {segmentation && (tissueResult || segmentation.wound_percentage === 0) && (
            <div ref={pushScaleRef} className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Escala Push
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-3 py-2 font-semibold bg-gray-100 text-center align-middle w-32">
                        Comprimento<br />X<br />Largura
                      </td>
                      {[
                        { score: 0, label: '0 cm²' },
                        { score: 1, label: '< 0.3 cm²' },
                        { score: 2, label: '0.3-0.6 cm²' },
                        { score: 3, label: '0.7-1.0 cm²' },
                        { score: 4, label: '1.1-2.0 cm²' },
                        { score: 5, label: '2.1-3.0 cm²' },
                        { score: 6, label: '3.1-4.0 cm²' },
                        { score: 7, label: '4.1-8.0 cm²' },
                        { score: 8, label: '8.1-12.0 cm²' },
                        { score: 9, label: '12.1-24.0 cm²' },
                        { score: 10, label: '>24.0 cm²' },
                      ].map((item) => (
                        <td
                          key={item.score}
                          className="border border-gray-300 px-2 py-2 text-center text-xs bg-gray-200 text-gray-400"
                        >
                          <div className="font-semibold">{item.score}</div>
                          <div className="whitespace-nowrap">{item.label}</div>
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td className="border border-gray-300 px-3 py-2 font-semibold text-center bg-gray-100 w-32">
                        Quantidade<br />Exsudato
                      </td>
                      {[
                        { score: 0, label: 'Ausente' },
                        { score: 1, label: 'Pequena' },
                        { score: 2, label: 'Moderada' },
                        { score: 3, label: 'Grande' },
                      ].map((item) => {
                        const exudateScore = getPushExudateScore(tissueResult?.xgboost_slough_amount);
                        const isHighlighted = exudateScore === item.score;
                        const exudateLevel = getExudateLevelFromScore(item.score);
                        const colorClasses = getExudateColor(exudateLevel);
                        return (
                          <td
                            key={item.score}
                            className={`border border-gray-300 px-2 py-2 text-center text-xs ${
                              isHighlighted
                                ? `${colorClasses} font-bold`
                                : 'bg-white text-gray-700'
                            }`}
                          >
                            <div className="font-semibold">{item.score}</div>
                            <div>{item.label}</div>
                          </td>
                        );
                      })}
                      {[4, 5, 6, 7, 8, 9, 10].map((score) => (
                        <td key={score} className="border border-gray-300 bg-gray-100"></td>
                      ))}
                    </tr>

                    <tr>
                      <td className="border border-gray-300 px-3 py-2 font-semibold text-center bg-gray-100 w-32">
                        Tipo de<br />Tecido
                      </td>
                      {[
                        { score: 0, label: 'Ferida\nFechada' },
                        { score: 1, label: 'Tecido\nEpitelial' },
                        { score: 2, label: 'Tecido de\nGranulação' },
                        { score: 3, label: 'Esfacelo' },
                        { score: 4, label: 'Tecido\nNecrótico' },
                      ].map((item) => {
                        const tissueScore = getPushTissueScore(
                          tissueResult?.xgboost_tissue_type,
                          segmentation.wound_percentage
                        );
                        const isHighlighted = tissueScore === item.score;
                        const tissueType = getTissueTypeFromScore(item.score);
                        const colorClasses = getTissueColor(tissueType);
                        return (
                          <td
                            key={item.score}
                            className={`border border-gray-300 px-2 py-2 text-center text-xs ${
                              isHighlighted
                                ? `${colorClasses} font-bold`
                                : 'bg-white text-gray-700'
                            }`}
                          >
                            <div className="font-semibold">{item.score}</div>
                            <div className="whitespace-pre-line">{item.label}</div>
                          </td>
                        );
                      })}
                      {[5, 6, 7, 8, 9, 10].map((score) => (
                        <td key={score} className="border border-gray-300 bg-gray-100"></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <p className="font-medium mb-2">Legenda:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>A célula destacada em <span className="font-semibold">negrito</span> indica o valor detectado</li>
                  <li>A linha de Comprimento X Largura está desabilitada (valores não calculados)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

