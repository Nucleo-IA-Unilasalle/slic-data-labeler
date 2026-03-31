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

interface DeepskinResult {
  pwat_score: number;
}

interface SurgwoundModalityResult {
  modality: string;
  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

interface SizeMeasurementResult {
  dfu_area_cm2: number;
  dfu_area_mm2: number;
  nail_area_mm2: number;
  px_per_mm: number;
  nail_detected: boolean;
  dfu_detected: boolean;
  calibration_source: 'user_provided' | 'population_average';
  dfu_dimensions: {
    length_mm: number;
    width_mm: number;
  };
  nail_dimensions: {
    length_mm: number;
    width_mm: number;
  };
  nail_mask: number[][];
  dfu_mask: number[][];
  original_width: number;
  original_height: number;
}

interface FetchOutcome {
  response: Response | null;
  networkError: Error | null;
}

async function fetchWithNetworkGrace(url: string, init: RequestInit): Promise<FetchOutcome> {
  try {
    const response: Response = await fetch(url, init);
    return { response, networkError: null };
  } catch (cause: unknown) {
    const networkError: Error =
      cause instanceof Error ? cause : new Error(String(cause));
    console.error('fetchWithNetworkGrace failed:', url, networkError);
    return { response: null, networkError };
  }
}

function parseSurgwoundModalityPayload(payload: unknown): SurgwoundModalityResult {
  if (payload === null || typeof payload !== 'object') {
    throw new TypeError('SurgWound: corpo JSON inválido');
  }
  const o: Record<string, unknown> = payload as Record<string, unknown>;
  const predictedLabelRaw: unknown = o.predicted_label;
  const confidenceRaw: unknown = o.confidence;
  const probabilitiesRaw: unknown = o.probabilities;
  const modalityRaw: unknown = o.modality;
  if (typeof predictedLabelRaw !== 'string') {
    throw new TypeError('SurgWound: predicted_label ausente ou inválido');
  }
  if (typeof confidenceRaw !== 'number' || !Number.isFinite(confidenceRaw)) {
    throw new TypeError('SurgWound: confidence ausente ou inválido');
  }
  const probabilities: Record<string, number> = {};
  if (
    probabilitiesRaw !== null &&
    typeof probabilitiesRaw === 'object' &&
    !Array.isArray(probabilitiesRaw)
  ) {
    for (const [key, value] of Object.entries(probabilitiesRaw)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        probabilities[key] = value;
      }
    }
  }
  const modality: string = typeof modalityRaw === 'string' ? modalityRaw : 'SurgWound';
  return {
    modality,
    predicted_label: predictedLabelRaw,
    confidence: confidenceRaw,
    probabilities,
  };
}

type SurgwoundParseResult =
  | { status: 'ok'; data: SurgwoundModalityResult }
  | { status: 'err'; message: string };

async function tryParseSurgwoundModality(outcome: FetchOutcome): Promise<SurgwoundParseResult> {
  if (outcome.networkError !== null) {
    return { status: 'err', message: outcome.networkError.message };
  }
  if (outcome.response === null) {
    return { status: 'err', message: 'resposta vazia' };
  }
  const response: Response = outcome.response;
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (readErr: unknown) {
    const msg: string = readErr instanceof Error ? readErr.message : 'falha ao ler resposta';
    return { status: 'err', message: msg };
  }
  if (!response.ok) {
    let errDetail: string = `HTTP ${String(response.status)}`;
    try {
      const errJson: unknown = JSON.parse(bodyText);
      if (
        typeof errJson === 'object' &&
        errJson !== null &&
        typeof (errJson as Record<string, unknown>).error === 'string'
      ) {
        errDetail = (errJson as Record<string, unknown>).error as string;
      }
    } catch {
      /* use HTTP status */
    }
    return { status: 'err', message: errDetail };
  }
  try {
    const data: unknown = JSON.parse(bodyText);
    const parsed: SurgwoundModalityResult = parseSurgwoundModalityPayload(data);
    return { status: 'ok', data: parsed };
  } catch (parseErr: unknown) {
    const msg: string =
      parseErr instanceof Error ? parseErr.message : 'JSON ou formato inválido';
    return { status: 'err', message: msg };
  }
}

function SurgwoundModalityPanel(props: {
  result: SurgwoundModalityResult | null;
  compact: boolean;
}) {
  const { result, compact } = props;
  if (result === null) {
    return null;
  }
  const titleClass: string = compact
    ? 'text-xs font-medium text-gray-600'
    : 'text-sm font-medium text-gray-600';
  const labelClass: string = compact
    ? 'text-base font-semibold text-gray-900'
    : 'text-lg font-semibold text-gray-900';
  const probText: string = compact ? 'text-xs' : 'text-sm';
  const probEntries: [string, number][] = Object.entries(result.probabilities).sort(
    (a: [string, number], b: [string, number]) => b[1] - a[1]
  );
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className={titleClass}>{result.modality}</p>
      <p className={labelClass}>{result.predicted_label}</p>
      <p className={`mt-1 text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
        Confiança: {(result.confidence * 100).toFixed(1)}%
      </p>
      {probEntries.length > 0 && (
        <details className={`mt-2 text-gray-600 ${probText}`}>
          <summary className="cursor-pointer font-medium text-gray-700">Probabilidades</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {probEntries.map((entry: [string, number]) => (
              <li key={entry[0]}>
                {entry[0]}: {(entry[1] * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
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
  const [deepskinResult, setDeepskinResult] = useState<DeepskinResult | null>(null);
  const [deepskinWarning, setDeepskinWarning] = useState<string | null>(null);
  const [surgwoundExudate, setSurgwoundExudate] = useState<SurgwoundModalityResult | null>(null);
  const [surgwoundHealing, setSurgwoundHealing] = useState<SurgwoundModalityResult | null>(null);
  const [surgwoundInfection, setSurgwoundInfection] = useState<SurgwoundModalityResult | null>(
    null
  );
  const [surgwoundWarning, setSurgwoundWarning] = useState<string | null>(null);
  const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);
  const [sizeMeasurement, setSizeMeasurement] = useState<SizeMeasurementResult | null>(null);
  const [combinedMaskImageUrl, setCombinedMaskImageUrl] = useState<string | null>(null);
  const [nailWarning, setNailWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const segmentationRef = useRef<HTMLDivElement>(null);
  const tissueResultRef = useRef<HTMLDivElement>(null);

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

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width <= maxWidth && height <= maxHeight) {
            resolve(file);
            return;
          }

          const aspectRatio = width / height;

          if (width > height) {
            if (width > maxWidth) {
              width = maxWidth;
              height = width / aspectRatio;
            }
          } else {
            if (height > maxHeight) {
              height = maxHeight;
              width = height * aspectRatio;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            const resizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          }, file.type);
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const resizedFile = await resizeImage(file, 800, 800);
        setSelectedFile(resizedFile);
        setPreviewUrl(URL.createObjectURL(resizedFile));
        setSegmentation(null);
        setTissueResult(null);
        setDeepskinResult(null);
        setDeepskinWarning(null);
        setSurgwoundExudate(null);
        setSurgwoundHealing(null);
        setSurgwoundInfection(null);
        setSurgwoundWarning(null);
        setMaskImageUrl(null);
        setSizeMeasurement(null);
        setCombinedMaskImageUrl(null);
        setNailWarning(null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process image');
      }
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

  const createCombinedMaskImage = (
    dfuMask: number[][],
    nailMask: number[][] | null,
    width: number,
    height: number
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const imageData = ctx.createImageData(width, height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const dfuValue = dfuMask[y]?.[x] ?? 0;
        const nailValue = nailMask ? (nailMask[y]?.[x] ?? 0) : 0;
        
        if (dfuValue > 0) {
          // Wound: Blue
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 255;
          imageData.data[idx + 3] = 180;
        } else if (nailValue > 0) {
          // Nail: Green
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 255;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 180;
        } else {
          // Transparent
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 0;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    setCombinedMaskImageUrl(canvas.toDataURL());
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
    setDeepskinWarning(null);
    setSurgwoundExudate(null);
    setSurgwoundHealing(null);
    setSurgwoundInfection(null);
    setSurgwoundWarning(null);
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

      const ingestSurgwoundTriplet = async (
        exOutcome: FetchOutcome,
        healOutcome: FetchOutcome,
        infOutcome: FetchOutcome
      ): Promise<void> => {
        const [exR, healR, infR]: [
          SurgwoundParseResult,
          SurgwoundParseResult,
          SurgwoundParseResult,
        ] = await Promise.all([
          tryParseSurgwoundModality(exOutcome),
          tryParseSurgwoundModality(healOutcome),
          tryParseSurgwoundModality(infOutcome),
        ]);

        setSurgwoundExudate(exR.status === 'ok' ? exR.data : null);
        setSurgwoundHealing(healR.status === 'ok' ? healR.data : null);
        setSurgwoundInfection(infR.status === 'ok' ? infR.data : null);

        const warnings: string[] = [];
        if (exR.status === 'err') {
          warnings.push(`Tipo de exsudato (SurgWound): ${exR.message}`);
        }
        if (healR.status === 'err') {
          warnings.push(`Estado de cicatrização (SurgWound): ${healR.message}`);
        }
        if (infR.status === 'err') {
          warnings.push(`Risco de infeção (SurgWound): ${infR.message}`);
        }
        setSurgwoundWarning(warnings.length > 0 ? warnings.join(' · ') : null);
      };

      const surgwoundRequestBody: string = JSON.stringify({ image: base64Image });

      // Step 3: Run tissue classification only if wound area > 0%
      if (segmentationData.wound_percentage > 0) {
        setLoadingStep(
          'Executando tecido, Deepskin e classificações SurgWound...'
        );

        const [
          tissueOutcome,
          deepskinOutcome,
          surgExOutcome,
          surgHealOutcome,
          surgInfOutcome,
        ] = await Promise.all([
          fetchWithNetworkGrace(`${apiUrl}/tissue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64Image,
              mask: segmentationData.mask
            }),
          }),
          fetchWithNetworkGrace(`${apiUrl}/deepskin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
          }),
          fetchWithNetworkGrace(`${apiUrl}/surgwound/exudate-type`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
          fetchWithNetworkGrace(`${apiUrl}/surgwound/healing-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
          fetchWithNetworkGrace(`${apiUrl}/surgwound/infection-risk-assessment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
        ]);

        await ingestSurgwoundTriplet(surgExOutcome, surgHealOutcome, surgInfOutcome);

        if (tissueOutcome.networkError !== null) {
          throw new Error(
            `Falha ao executar classificação de tecido: ${tissueOutcome.networkError.message}`
          );
        }
        if (tissueOutcome.response === null) {
          throw new Error('Falha ao executar classificação de tecido: resposta vazia');
        }
        const tissueResponse: Response = tissueOutcome.response;
        if (!tissueResponse.ok) {
          throw new Error('Falha ao executar classificação de tecido');
        }

        const tissueData: TissueResult = await tissueResponse.json();
        setTissueResult(tissueData);

        if (deepskinOutcome.networkError !== null) {
          setDeepskinResult(null);
          setDeepskinWarning(
            `Análise Deepskin indisponível (rede): ${deepskinOutcome.networkError.message}`
          );
        } else if (deepskinOutcome.response === null) {
          setDeepskinResult(null);
          setDeepskinWarning('Análise Deepskin indisponível: resposta vazia');
        } else {
          const deepskinResponse: Response = deepskinOutcome.response;
          if (!deepskinResponse.ok) {
            setDeepskinResult(null);
            setDeepskinWarning(
              `Análise Deepskin indisponível (HTTP ${String(deepskinResponse.status)}). Demais resultados foram mantidos.`
            );
          } else {
            try {
              const deepskinData: unknown = await deepskinResponse.json();
              if (
                typeof deepskinData !== 'object' ||
                deepskinData === null ||
                !('pwat_score' in deepskinData) ||
                typeof (deepskinData as DeepskinResult).pwat_score !== 'number'
              ) {
                throw new TypeError('Resposta Deepskin com formato inválido');
              }
              setDeepskinResult(deepskinData as DeepskinResult);
              setDeepskinWarning(null);
            } catch (parseErr: unknown) {
              const msg: string =
                parseErr instanceof Error ? parseErr.message : 'Erro ao interpretar Deepskin';
              console.error('Deepskin parse failed:', parseErr);
              setDeepskinResult(null);
              setDeepskinWarning(`Análise Deepskin indisponível: ${msg}`);
            }
          }
        }
      } else {
        setLoadingStep('Executando classificações SurgWound...');
        const [surgExOutcome, surgHealOutcome, surgInfOutcome] = await Promise.all([
          fetchWithNetworkGrace(`${apiUrl}/surgwound/exudate-type`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
          fetchWithNetworkGrace(`${apiUrl}/surgwound/healing-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
          fetchWithNetworkGrace(`${apiUrl}/surgwound/infection-risk-assessment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surgwoundRequestBody,
          }),
        ]);
        await ingestSurgwoundTriplet(surgExOutcome, surgHealOutcome, surgInfOutcome);
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
    setDeepskinResult(null);
    setDeepskinWarning(null);
    setSurgwoundExudate(null);
    setSurgwoundHealing(null);
    setSurgwoundInfection(null);
    setSurgwoundWarning(null);
    setMaskImageUrl(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setSizeMeasurement(null);
    setCombinedMaskImageUrl(null);
    setNailWarning(null);
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

          {deepskinWarning && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded">
              <p className="text-sm text-amber-900 font-medium">Aviso</p>
              <p className="text-xs text-amber-800 mt-1">{deepskinWarning}</p>
            </div>
          )}

          {surgwoundWarning && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded">
              <p className="text-sm text-amber-900 font-medium">Aviso</p>
              <p className="text-xs text-amber-800 mt-1">{surgwoundWarning}</p>
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
                  <div className="relative overflow-hidden rounded-lg border border-gray-200">
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

          {/* Deepskin Results */}
          {deepskinResult && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4 md:p-6">
              <h2 className="text-base md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">
                Análise Deepskin
              </h2>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 text-center">
                <p className="text-sm font-medium text-blue-800 mb-1">Score PWAT</p>
                <p className="text-3xl font-bold text-blue-900">
                  {deepskinResult.pwat_score.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {(surgwoundExudate !== null ||
            surgwoundHealing !== null ||
            surgwoundInfection !== null) && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4 space-y-3">
              <h2 className="text-base font-semibold text-gray-800">SurgWound</h2>
              <SurgwoundModalityPanel result={surgwoundExudate} compact={true} />
              <SurgwoundModalityPanel result={surgwoundHealing} compact={true} />
              <SurgwoundModalityPanel result={surgwoundInfection} compact={true} />
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

          {deepskinWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h3 className="text-amber-900 font-semibold mb-1">Aviso</h3>
              <p className="text-amber-800">{deepskinWarning}</p>
            </div>
          )}

          {surgwoundWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h3 className="text-amber-900 font-semibold mb-1">Aviso</h3>
              <p className="text-amber-800">{surgwoundWarning}</p>
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
                  <div className="overflow-hidden rounded-lg border border-gray-300">
                    <img
                      src={previewUrl || ''}
                      alt="Original"
                      className="h-auto w-full"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Sobreposição de Segmentação</p>
                  <div className="relative overflow-hidden rounded-lg border border-gray-300">
                    <img
                      src={previewUrl || ''}
                      alt="Base"
                      className="h-auto w-full"
                    />
                    <img
                      src={maskImageUrl}
                      alt="Máscara"
                      className="absolute top-0 left-0 h-auto w-full"
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

          {/* Deepskin Results - Desktop */}
          {deepskinResult && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Análise Deepskin
              </h2>
              <div className="bg-blue-50 rounded-lg p-4 block w-full border border-blue-100 text-center">
                <p className="text-sm font-medium text-blue-800 mb-1">Score PWAT</p>
                <p className="text-3xl font-bold text-blue-900">
                  {deepskinResult.pwat_score.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {(surgwoundExudate !== null ||
            surgwoundHealing !== null ||
            surgwoundInfection !== null) && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-800">SurgWound</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SurgwoundModalityPanel result={surgwoundExudate} compact={false} />
                <SurgwoundModalityPanel result={surgwoundHealing} compact={false} />
                <SurgwoundModalityPanel result={surgwoundInfection} compact={false} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

