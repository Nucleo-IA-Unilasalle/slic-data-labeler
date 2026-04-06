'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Check, Copy, Loader2 } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function preparePipelineJsonForDisplay(data: unknown, includeMask: boolean): unknown {
  if (includeMask) {
    return data;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  try {
    const clone: unknown = structuredClone(data);
    if (typeof clone !== 'object' || clone === null) {
      return data;
    }
    const root = clone as Record<string, unknown>;
    const seg = root.segmentation;
    if (seg !== null && typeof seg === 'object' && !Array.isArray(seg)) {
      const segObj = seg as Record<string, unknown>;
      if ('mask' in segObj) {
        segObj.mask =
          '[omitted: large array — enable “Incluir máscara na visualização” or use Copy for full JSON]';
      }
    }
    return clone;
  } catch {
    return data;
  }
}

function fileToBase64(file: File): Promise<string> {
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
}

function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<File> {
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
}

export default function JsonViewPage() {
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [includeMaskInView, setIncludeMaskInView] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<unknown>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copyDone, setCopyDone] = useState<boolean>(false);

  const fetchActiveApiUrl = useCallback(async () => {
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
        setApiError(null);
      } else {
        setApiError('Nenhuma instância de API ativa encontrada');
      }
    } catch (err) {
      console.error('Error fetching API URL:', err);
      setApiError(err instanceof Error ? err.message : 'Falha ao buscar URL da API');
    }
  }, []);

  useEffect(() => {
    fetchActiveApiUrl();
  }, [fetchActiveApiUrl]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const resizedFile = await resizeImage(file, 800, 800);
      setSelectedFile(resizedFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(resizedFile));
      setPipelineResult(null);
      setDisplayError(null);
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : 'Falha ao processar imagem');
    }
  };

  const handleRunPipeline = async () => {
    if (!selectedFile) {
      setDisplayError('Selecione uma imagem primeiro');
      return;
    }
    if (!apiUrl) {
      setDisplayError('Nenhuma API ativa. Tente recarregar a página.');
      await fetchActiveApiUrl();
      return;
    }

    setIsLoading(true);
    setDisplayError(null);
    setPipelineResult(null);

    try {
      const base64Image = await fileToBase64(selectedFile);
      const response = await fetch(`${apiUrl}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      const bodyText = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText) as unknown;
      } catch {
        throw new Error('Resposta não é JSON válido');
      }

      if (!response.ok) {
        const errMsg =
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as Record<string, unknown>).error === 'string'
            ? (parsed as Record<string, unknown>).error
            : `HTTP ${String(response.status)}`;
        throw new Error(typeof errMsg === 'string' ? errMsg : 'Erro na API');
      }

      setPipelineResult(parsed);
    } catch (err) {
      setDisplayError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  };

  const jsonForDisplay: string =
    pipelineResult === null
      ? ''
      : JSON.stringify(
          preparePipelineJsonForDisplay(pipelineResult, includeMaskInView),
          null,
          2
        );

  const jsonForCopy: string =
    pipelineResult === null ? '' : JSON.stringify(pipelineResult, null, 2);

  const handleCopy = async () => {
    if (jsonForCopy === '') {
      return;
    }
    try {
      await navigator.clipboard.writeText(jsonForCopy);
      setCopyDone(true);
      window.setTimeout(() => {
        setCopyDone(false);
      }, 2000);
    } catch (err) {
      console.error('Clipboard failed:', err);
      setDisplayError('Não foi possível copiar para a área de transferência');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">
          Resposta JSON do pipeline
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Chama <code className="rounded bg-gray-200 px-1 py-0.5 text-xs">POST /pipeline</code>{' '}
          (segmentação, tecido e SurgWound) na mesma URL da API em uso no pipeline-demo.
        </p>

        {apiUrl && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">API ativa:</span> {apiUrl}
            </p>
          </div>
        )}

        {!apiUrl && !apiError && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-sm text-yellow-900">Carregando instância da API…</p>
          </div>
        )}

        {apiError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{apiError}</p>
          </div>
        )}

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700">
            Imagem
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />

          {previewUrl && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Pré-visualização</p>
              <img
                src={previewUrl}
                alt="Pré-visualização"
                className="max-h-64 max-w-full rounded-lg border border-gray-200"
              />
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeMaskInView}
              onChange={(e) => setIncludeMaskInView(e.target.checked)}
            />
            Incluir máscara completa na visualização (a resposta pode ficar muito grande)
          </label>

          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={!selectedFile || isLoading || !apiUrl}
            className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isLoading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Executando pipeline…
              </span>
            ) : (
              'Executar pipeline'
            )}
          </button>
        </div>

        {displayError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{displayError}</p>
          </div>
        )}

        {pipelineResult !== null && (
          <div className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">JSON</h2>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                {copyDone ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar JSON completo
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-800 shadow-inner">
              {jsonForDisplay}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
