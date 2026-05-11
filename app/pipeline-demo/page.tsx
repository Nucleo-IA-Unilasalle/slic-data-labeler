'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Camera, FileDown, LayoutGrid, Loader2 } from 'lucide-react';
import Link from 'next/link';

import {
  downloadPipelineReport,
  type PipelineAuditClientRow,
  type PipelineInferenceCallDbRow,
  type PipelineReportInput,
} from './pipelinePdf';

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

type SizeCalibrationMethod = 'aruco' | 'nail';

/** OpenCV predefined dictionary cv2.aruco.DICT_4X4_50 (must match printed markers). */
const ARUCO_DICT_4X4_50 = 0;

interface SizeMeasurementResult {
  error?: string;
  dfu_area_cm2: number;
  dfu_area_mm2: number;
  nail_area_mm2?: number;
  px_per_mm: number;
  nail_detected: boolean;
  aruco_detected?: boolean;
  dfu_detected: boolean;
  calibration_source: string;
  dfu_dimensions: {
    length_mm: number;
    width_mm: number;
  };
  nail_dimensions?: {
    length_mm: number;
    width_mm: number;
  };
  printed_marker_square_side_mm?: number;
  nail_mask?: number[][] | null;
  aruco_quad_mask?: number[][] | null;
  dfu_mask: number[][];
  original_width: number;
  original_height: number;
  aruco_calibration_marker_ids?: number[];
  px_per_mm_by_marker_id?: Record<string, number>;
}

function pickReferenceMaskForOverlay(sm: SizeMeasurementResult): number[][] | null {
  const aruco = sm.aruco_quad_mask;
  if (aruco !== null && aruco !== undefined && Array.isArray(aruco) && aruco.length > 0) {
    return aruco;
  }
  const nail = sm.nail_mask;
  if (nail !== null && nail !== undefined && Array.isArray(nail) && nail.length > 0) {
    return nail;
  }
  return null;
}

function showRealWorldSizing(
  sm: SizeMeasurementResult | null,
  method: SizeCalibrationMethod
): boolean {
  if (sm === null || !sm.dfu_detected) {
    return false;
  }
  if (method === 'aruco') {
    return sm.aruco_detected === true;
  }
  return sm.nail_detected === true;
}

function SizeCalibrationRadios(props: {
  value: SizeCalibrationMethod;
  onChange: (method: SizeCalibrationMethod) => void;
  disabled: boolean;
  layout: 'mobile' | 'desktop';
}) {
  const { value, onChange, disabled, layout } = props;
  const isDesktop = layout === 'desktop';
  const legendClass: string = isDesktop
    ? 'text-sm font-medium text-gray-800 mb-2'
    : 'text-xs font-medium text-gray-800 mb-2';
  const optionClass: string = isDesktop ? 'text-sm text-gray-800' : 'text-xs text-gray-800';

  const name: string =
    layout === 'desktop'
      ? 'pipeline-size-calibration-desktop'
      : 'pipeline-size-calibration-mobile';

  const rowCls: string = 'flex items-start gap-2 cursor-pointer';

  return (
    <fieldset disabled={disabled} className={isDesktop ? '' : '-mx-0.5'}>
      <legend className={legendClass}>Medição da ferida (escala física)</legend>
      <div className="space-y-2">
        <label className={rowCls}>
          <input
            type="radio"
            name={name}
            checked={value === 'aruco'}
            onChange={() => {
              onChange('aruco');
            }}
            className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className={optionClass}>
            ArUco — marcadores 0 e 1 na mesma tira (padrão)
          </span>
        </label>
        <label className={rowCls}>
          <input
            type="radio"
            name={name}
            checked={value === 'nail'}
            onChange={() => {
              onChange('nail');
            }}
            className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className={optionClass}>Unha — segmentação da unha como referência</span>
        </label>
      </div>
    </fieldset>
  );
}

function ArucoMarkerSideCmField(props: {
  valueCm: string;
  onChangeValueCm: (valueCm: string) => void;
  disabled: boolean;
  layout: 'mobile' | 'desktop';
}) {
  const { valueCm, onChangeValueCm, disabled, layout } = props;
  const isDesktop = layout === 'desktop';
  const labelClass: string = isDesktop
    ? 'mb-1 block text-sm font-medium text-gray-700'
    : 'mb-1 block text-xs font-medium text-gray-700';
  const inputClass: string = isDesktop
    ? 'mt-0 block w-full max-w-[12rem] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100'
    : 'mt-0 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100';
  const hintClass: string = isDesktop ? 'mt-1 text-xs text-gray-500' : 'mt-1 text-[11px] text-gray-500';

  const inputId: string =
    layout === 'desktop' ? 'aruco-marker-cm-desktop' : 'aruco-marker-cm-mobile';

  return (
    <div className={isDesktop ? 'mt-3' : 'mt-3 pl-0.5'}>
      <label htmlFor={inputId} className={labelClass}>
        Lado do quadrado do marcador (cm)
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valueCm}
        disabled={disabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChangeValueCm(e.target.value);
        }}
        className={inputClass}
        aria-describedby={`${inputId}-hint`}
      />
      <p id={`${inputId}-hint`} className={hintClass}>
        Tamanho físico impresso da borda preta do ArUco; padrão 1 cm (= 10 mm por marcador).
      </p>
    </div>
  );
}

interface FpResult {
  predicted_class: string;
  needs_retry_photo: boolean;
  probabilities: Record<string, number>;
}

interface FetchOutcome {
  response: Response | null;
  networkError: Error | null;
}

interface LaserDecisionInput {
  tecido: string | null;
  qtd_exudato: string | null;
  tipo_exsudato: string | null;
  sinais_infeccao: boolean;
  status: string | null;
}

type LaserDecisionKind = 'bloqueio' | 'recomendacao' | 'orientacao' | 'insuficiente';

interface LaserDecisionResult {
  kind: LaserDecisionKind;
  message: string;
  channels: string[];
  alert: string | null;
  input: LaserDecisionInput;
}

interface AuditPayload {
  image_id: string | null;
  inference_call_id: string | null;
  observation_id: string | null;
}

function splitJsonWithAudit(raw: unknown): { rest: unknown; audit: AuditPayload | null } {
  if (typeof raw !== 'object' || raw === null) {
    return { rest: raw, audit: null };
  }
  const o = raw as Record<string, unknown>;
  const auditRaw = o['_audit'];
  const { _audit: _ignored, ...rest } = o;
  if (typeof auditRaw !== 'object' || auditRaw === null) {
    return { rest, audit: null };
  }
  const a = auditRaw as Record<string, unknown>;
  return {
    rest,
    audit: {
      image_id: typeof a.image_id === 'string' ? a.image_id : null,
      inference_call_id:
        typeof a.inference_call_id === 'string' ? a.inference_call_id : null,
      observation_id: typeof a.observation_id === 'string' ? a.observation_id : null,
    },
  };
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

function mapApiTissueToLaserTissue(tissueType: string | null): string | null {
  if (tissueType === null) {
    return null;
  }
  const normalized: string = tissueType.trim().toLowerCase();
  if (normalized === 'epitelial') {
    return 'Epitelial';
  }
  if (normalized === 'granulação' || normalized === 'granulacao') {
    return 'Granulação';
  }
  if (normalized === 'esfacelo') {
    return 'Esfacelo';
  }
  if (normalized === 'necrotic') {
    return 'Necrótico';
  }
  return tissueType;
}

function mapApiExudateAmountToLaserAmount(exudateAmount: string | null): string | null {
  if (exudateAmount === null) {
    return null;
  }
  const normalized: string = exudateAmount.trim().toLowerCase();
  if (normalized === 'none') {
    return 'Ausente';
  }
  if (normalized === 'low') {
    return 'Baixo';
  }
  if (normalized === 'medium') {
    return 'Moderado';
  }
  if (normalized === 'high') {
    return 'Intenso';
  }
  return exudateAmount;
}

function hasInfectionSigns(infectionRiskLabel: string | null): boolean {
  if (infectionRiskLabel === null) {
    return false;
  }
  return infectionRiskLabel.trim().toLowerCase() === 'alto';
}

function runLaserDecision(input: LaserDecisionInput): LaserDecisionResult {
  const { tecido, qtd_exudato, tipo_exsudato, sinais_infeccao, status } = input;

  if (tecido === 'Necrose não desbridada' || tecido === 'Necrótico') {
    return {
      kind: 'bloqueio',
      message: '❌ BLOQUEIO: Bloqueia dose local; não automatizar. Solicitar avaliação/desbridamento.',
      channels: [],
      alert: null,
      input,
    };
  }

  if (sinais_infeccao) {
    return {
      kind: 'bloqueio',
      message: '❌ BLOQUEIO: Sinais de Infecção detectados. Encaminhar para avaliação especializada.',
      channels: [],
      alert: null,
      input,
    };
  }

  if (tecido === 'Fora do escopo') {
    return {
      kind: 'bloqueio',
      message: '❌ BLOQUEIO: Caso fora do escopo. Exibir necessidade de avaliação especializada.',
      channels: [],
      alert: null,
      input,
    };
  }

  if (
    tecido === 'Fechada / Cicatrizada' ||
    status === 'Cicatrizada' ||
    qtd_exudato === 'Ausente' ||
    tipo_exsudato === 'Inexistente'
  ) {
    return {
      kind: 'recomendacao',
      message: '✅ RECOMENDAÇÃO: INFRA (Protocolo de manutenção; uso adjuvante).',
      channels: ['INFRA'],
      alert: null,
      input,
    };
  }

  const suggestedChannels: Set<string> = new Set<string>();
  if (
    tecido === 'Epitelial' ||
    tecido === 'Granulação' ||
    tecido === 'Esfacelo' ||
    tecido === 'Necrose desbridada'
  ) {
    suggestedChannels.add('VERMELHO');
  }
  if (tecido === 'Granulação' || tecido === 'Esfacelo') {
    suggestedChannels.add('INFRA');
  }

  let alert: string | null = null;
  if (tecido === 'Esfacelo') {
    alert = ' [OBS: Apenas após limpeza adequada; não usar isoladamente]';
  } else if (qtd_exudato === 'Moderado') {
    alert = ' [OBS: Reforçar reavaliação; evitar escalonamento automático]';
  }

  if (suggestedChannels.size === 0) {
    if (tecido === 'Necrose desbridada') {
      return {
        kind: 'orientacao',
        message: '⚠️ ORIENTAÇÃO: Reclassificar após desbridamento para definir leito predominante.',
        channels: [],
        alert: null,
        input,
      };
    }
    return {
      kind: 'insuficiente',
      message: '⚠️ Dados insuficientes para recomendação automática.',
      channels: [],
      alert: null,
      input,
    };
  }

  const channels: string[] = Array.from(suggestedChannels).sort();
  const channelsText: string = channels.join(' + ');
  return {
    kind: 'recomendacao',
    message: `Canais: ${channelsText}${alert ?? ''}`,
    channels,
    alert,
    input,
  };
}

function getLaserDecisionContainerClass(kind: LaserDecisionKind): string {
  if (kind === 'bloqueio') {
    return 'border-red-200 bg-red-50';
  }
  if (kind === 'recomendacao') {
    return 'border-green-200 bg-green-50';
  }
  if (kind === 'orientacao') {
    return 'border-amber-200 bg-amber-50';
  }
  return 'border-gray-200 bg-gray-50';
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

async function tryParseSurgwoundModality(
  outcome: FetchOutcome,
  endpointPath: string,
  recordAudit: (endpoint: string, payload: unknown) => void
): Promise<SurgwoundParseResult> {
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
    recordAudit(endpointPath, data);
    const { rest } = splitJsonWithAudit(data);
    const parsed: SurgwoundModalityResult = parseSurgwoundModalityPayload(rest);
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

interface ObservationSectionProps {
  observationText: string;
  onObservationChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
  feedback: string | null;
  layout: 'mobile' | 'desktop';
}

function ObservationSection(props: ObservationSectionProps) {
  const {
    observationText,
    onObservationChange,
    onSave,
    isSaving,
    feedback,
    layout,
  } = props;
  const isDesktop: boolean = layout === 'desktop';
  const containerClass: string = isDesktop
    ? 'bg-white rounded-lg shadow-md p-6 mb-6'
    : 'bg-white rounded-lg shadow-md p-4 mb-4';
  const titleClass: string = isDesktop
    ? 'text-xl font-semibold text-gray-800 mb-2'
    : 'text-base font-semibold text-gray-800 mb-2';
  const hintClass: string = isDesktop ? 'text-sm text-gray-500 mb-3' : 'text-xs text-gray-500 mb-3';

  return (
    <div className={containerClass}>
      <h2 className={titleClass}>Observações clínicas</h2>
      <p className={hintClass}>
        Disponível após concluir a análise completa. O texto é associado à mesma imagem usada neste pipeline.
      </p>
      <label
        htmlFor={isDesktop ? 'observation-desktop' : 'observation-mobile'}
        className={`block font-medium text-gray-700 mb-2 ${isDesktop ? 'text-sm' : 'text-xs'}`}
      >
        Observação
      </label>
      <textarea
        id={isDesktop ? 'observation-desktop' : 'observation-mobile'}
        value={observationText}
        onChange={(e) => onObservationChange(e.target.value)}
        rows={isDesktop ? 4 : 3}
        placeholder="Notas clínicas ou contexto adicional…"
        disabled={isSaving}
        className={
          isDesktop
            ? 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100'
            : 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100'
        }
      />
      <button
        type="button"
        onClick={() => {
          void onSave();
        }}
        disabled={isSaving || observationText.trim() === ''}
        className={
          isDesktop
            ? 'mt-3 inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400'
            : 'mt-3 flex w-full items-center justify-center rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white active:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400'
        }
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Salvando…
          </>
        ) : (
          'Salvar observação'
        )}
      </button>
      {feedback !== null && feedback !== '' && (
        <p
          className={
            feedback.startsWith('Erro')
              ? `mt-2 ${isDesktop ? 'text-sm text-red-700' : 'text-xs text-red-700'}`
              : `mt-2 ${isDesktop ? 'text-sm text-green-700' : 'text-xs text-green-700'}`
          }
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

interface PdfExportSectionProps {
  layout: 'mobile' | 'desktop';
  isExporting: boolean;
  onExport: () => void;
}

function PdfExportSection(props: PdfExportSectionProps) {
  const { layout, isExporting, onExport } = props;
  const isDesktop: boolean = layout === 'desktop';
  const containerClass: string = isDesktop
    ? 'bg-white rounded-lg shadow-md p-6 mb-6'
    : 'bg-white rounded-lg shadow-md p-4 mb-4';
  const titleClass: string = isDesktop
    ? 'text-xl font-semibold text-gray-800 mb-2'
    : 'text-base font-semibold text-gray-800 mb-2';
  const hintClass: string = isDesktop ? 'text-sm text-gray-500 mb-3' : 'text-xs text-gray-500 mb-3';

  return (
    <div className={containerClass}>
      <h2 className={titleClass}>Exportar relatório</h2>
      <p className={hintClass}>
        Gera um PDF com a imagem analisada (se disponível), sobreposição da segmentação (ferida e
        referência quando houver), FP, dimensões, tecido,
        Deepskin, SurgWound, laser e o texto de observação atual.
      </p>
      <button
        type="button"
        onClick={() => {
          void onExport();
        }}
        disabled={isExporting}
        className={
          isDesktop
            ? 'inline-flex items-center justify-center rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-gray-400'
            : 'flex w-full items-center justify-center rounded-lg bg-slate-700 py-3 text-sm font-medium text-white active:bg-slate-800 disabled:cursor-not-allowed disabled:bg-gray-400'
        }
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Gerando PDF…
          </>
        ) : (
          <>
            <FileDown className="mr-2 h-4 w-4" aria-hidden />
            Exportar PDF
          </>
        )}
      </button>
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
  const [sizeCalibrationMethod, setSizeCalibrationMethod] =
    useState<SizeCalibrationMethod>('aruco');
  const [arucoMarkerSideCm, setArucoMarkerSideCm] = useState<string>('1');
  const [fpResult, setFpResult] = useState<FpResult | null>(null);
  const [fpAdvice, setFpAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [observationText, setObservationText] = useState<string>('');
  const [pipelineRunComplete, setPipelineRunComplete] = useState<boolean>(false);
  const [isSavingObservation, setIsSavingObservation] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [observationFeedback, setObservationFeedback] = useState<string | null>(null);
  const lastPipelineBase64Ref = useRef<string | null>(null);
  const pipelineAuditTrailRef = useRef<PipelineAuditClientRow[]>([]);
  const segmentationRef = useRef<HTMLDivElement>(null);
  const tissueResultRef = useRef<HTMLDivElement>(null);
  const laserDecision: LaserDecisionResult | null = useMemo(() => {
    if (
      tissueResult === null &&
      surgwoundExudate === null &&
      surgwoundHealing === null &&
      surgwoundInfection === null
    ) {
      return null;
    }
    const input: LaserDecisionInput = {
      tecido: mapApiTissueToLaserTissue(tissueResult?.xgboost_tissue_type ?? null),
      qtd_exudato: mapApiExudateAmountToLaserAmount(tissueResult?.xgboost_slough_amount ?? null),
      tipo_exsudato: surgwoundExudate?.predicted_label ?? null,
      sinais_infeccao: hasInfectionSigns(surgwoundInfection?.predicted_label ?? null),
      status: surgwoundHealing?.predicted_label ?? null,
    };
    return runLaserDecision(input);
  }, [tissueResult, surgwoundExudate, surgwoundHealing, surgwoundInfection]);

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
        setObservationText('');
        setPipelineRunComplete(false);
        setObservationFeedback(null);
        lastPipelineBase64Ref.current = null;
        pipelineAuditTrailRef.current = [];
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

  useEffect(() => {
    if (sizeMeasurement && sizeMeasurement.dfu_mask) {
      createCombinedMaskImage(
        sizeMeasurement.dfu_mask,
        pickReferenceMaskForOverlay(sizeMeasurement),
        sizeMeasurement.original_width,
        sizeMeasurement.original_height
      );
    }
  }, [sizeMeasurement]);

  const createMaskImage = (mask: number[][], width: number, height: number) => {
    const w = Number.isFinite(width) && width > 0 ? Math.round(width) : mask[0]?.length ?? 0;
    const h = Number.isFinite(height) && height > 0 ? Math.round(height) : mask.length ?? 0;
    if (w <= 0 || h <= 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const imageData = ctx.createImageData(w, h);
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
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
    const w = Number.isFinite(width) && width > 0 ? Math.round(width) : dfuMask[0]?.length ?? 0;
    const h = Number.isFinite(height) && height > 0 ? Math.round(height) : dfuMask.length ?? 0;
    if (w <= 0 || h <= 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const imageData = ctx.createImageData(w, h);
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
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
    setPipelineRunComplete(false);
    setObservationFeedback(null);
    lastPipelineBase64Ref.current = null;
    pipelineAuditTrailRef.current = [];
    setObservationText('');
    setDeepskinWarning(null);
    setSurgwoundExudate(null);
    setSurgwoundHealing(null);
    setSurgwoundInfection(null);
    setSurgwoundWarning(null);
    setSegmentation(null);
    setTissueResult(null);
    setMaskImageUrl(null);
    setSizeMeasurement(null);
    setCombinedMaskImageUrl(null);
    setNailWarning(null);
    setFpResult(null);
    setFpAdvice(null);

    try {
      // Step 1: Convert image to base64
      setLoadingStep('Convertendo imagem...');
      const base64Image = await fileToBase64(selectedFile);

      const recordAudit = (endpoint: string, raw: unknown): void => {
        const { audit } = splitJsonWithAudit(raw);
        if (audit === null) {
          return;
        }
        if (
          audit.image_id === null &&
          audit.inference_call_id === null &&
          audit.observation_id === null
        ) {
          return;
        }
        pipelineAuditTrailRef.current.push({
          endpoint,
          imageId: audit.image_id,
          inferenceCallId: audit.inference_call_id,
          observationId: audit.observation_id,
        });
      };

      // Step 2: Run FP pre-check
      setLoadingStep('Executando pré-checagem FP...');
      const fpResponse = await fetch(`${apiUrl}/fp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!fpResponse.ok) {
        throw new Error('Falha ao executar pré-checagem FP');
      }

      const fpRaw: unknown = await fpResponse.json();
      recordAudit('/fp', fpRaw);
      const { rest: fpRest } = splitJsonWithAudit(fpRaw);
      const fpData: FpResult = fpRest as FpResult;
      setFpResult(fpData);

      const majorityClass = Object.entries(fpData.probabilities).reduce(
        (best, cur) => (cur[1] > best[1] ? cur : best),
        ['', -Infinity] as [string, number]
      )[0];

      if (majorityClass === 'other') {
        setFpAdvice('A imagem foi classificada majoritariamente como "other". Recomendamos retirar a foto e tentar novamente.');
      } else {
        setFpAdvice(null);
      }

      let arucoMarkerSideLengthMm: number | null = null;
      if (sizeCalibrationMethod === 'aruco') {
        const sideCmNormalized: string = arucoMarkerSideCm.trim().replace(',', '.');
        const sideCmParsed: number = Number.parseFloat(sideCmNormalized);
        if (!Number.isFinite(sideCmParsed) || sideCmParsed <= 0) {
          throw new Error(
            'Informe um tamanho do marcador ArUco em centímetros válido (número maior que zero).'
          );
        }
        arucoMarkerSideLengthMm = sideCmParsed * 10;
      }

      // Step 3: Run size measurement (ArUco strip or nail-based scale)
      setLoadingStep(
        sizeCalibrationMethod === 'aruco'
          ? 'Analisando imagem e marcadores ArUco...'
          : 'Analisando imagem e detectando unha...'
      );

      let sizeMeasurementData: SizeMeasurementResult | null = null;
      let segmentationData: SegmentationResult | null = null;

      const measurementFailureThenSegmentOnly = async (
        warningMsg: string
      ): Promise<void> => {
        setNailWarning(warningMsg);
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

        const segRawFall: unknown = await segmentationResponse.json();
        recordAudit('/segmentation', segRawFall);
        const { rest: segRestFall } = splitJsonWithAudit(segRawFall);
        segmentationData = segRestFall as SegmentationResult;
        setSegmentation(segmentationData);
      };

      try {
        if (sizeCalibrationMethod === 'aruco') {
          if (arucoMarkerSideLengthMm === null) {
            throw new Error('Calibração ArUco: tamanho do marcador inválido.');
          }
          const sizeMeasurementResponse = await fetch(`${apiUrl}/size-measurement-aruco`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: base64Image,
              include_masks: true,
              aruco_dictionary_id: ARUCO_DICT_4X4_50,
              marker_side_length_mm: arucoMarkerSideLengthMm,
            }),
          });

          const smRaw: unknown = await sizeMeasurementResponse.json();
          const arucoEndpoint: string = '/size-measurement-aruco';

          if (typeof smRaw === 'object' && smRaw !== null) {
            recordAudit(arucoEndpoint, smRaw);
          }

          const { rest: smRest } = splitJsonWithAudit(smRaw);
          const hasError =
            typeof smRest === 'object' &&
            smRest !== null &&
            'error' in smRest &&
            typeof (smRest as { error?: string }).error === 'string';

          if (sizeMeasurementResponse.ok && !hasError) {
            sizeMeasurementData = smRest as SizeMeasurementResult;
            setSizeMeasurement(sizeMeasurementData);

            if (sizeMeasurementData && sizeMeasurementData.dfu_mask) {
              createCombinedMaskImage(
                sizeMeasurementData.dfu_mask,
                pickReferenceMaskForOverlay(sizeMeasurementData),
                sizeMeasurementData.original_width,
                sizeMeasurementData.original_height
              );

              const woundPixels = sizeMeasurementData.dfu_mask.reduce(
                (sum, row) => sum + row.filter((v: number) => v > 0).length,
                0
              );
              segmentationData = {
                mask: sizeMeasurementData.dfu_mask,
                original_width: sizeMeasurementData.original_width,
                original_height: sizeMeasurementData.original_height,
                wound_pixels: woundPixels,
                total_pixels:
                  sizeMeasurementData.original_width *
                  sizeMeasurementData.original_height,
                wound_percentage: sizeMeasurementData.dfu_detected
                  ? (sizeMeasurementData.dfu_area_mm2 /
                      ((sizeMeasurementData.original_width *
                        sizeMeasurementData.original_height) /
                        (sizeMeasurementData.px_per_mm *
                          sizeMeasurementData.px_per_mm))) *
                    100
                  : 0,
              };
              setSegmentation(segmentationData);
            }
          } else {
            let detail: string =
              'Marcadores ArUco 0 e 1 não foram detectados com sucesso.';
            if (hasError) {
              detail = String((smRest as { error: string }).error);
            }
            await measurementFailureThenSegmentOnly(
              `Calibração ArUco: ${detail}`
            );
          }
        } else {
          const sizeMeasurementResponse = await fetch(`${apiUrl}/size-measurement`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: base64Image, include_masks: true }),
          });

          if (sizeMeasurementResponse.ok) {
            const smRaw: unknown = await sizeMeasurementResponse.json();
            recordAudit('/size-measurement', smRaw);
            const { rest: smRest } = splitJsonWithAudit(smRaw);
            sizeMeasurementData = smRest as SizeMeasurementResult;
            setSizeMeasurement(sizeMeasurementData);

            if (sizeMeasurementData && sizeMeasurementData.dfu_mask) {
              createCombinedMaskImage(
                sizeMeasurementData.dfu_mask,
                pickReferenceMaskForOverlay(sizeMeasurementData),
                sizeMeasurementData.original_width,
                sizeMeasurementData.original_height
              );

              const woundPixels = sizeMeasurementData.dfu_mask.reduce(
                (sum, row) => sum + row.filter((v: number) => v > 0).length,
                0
              );
              segmentationData = {
                mask: sizeMeasurementData.dfu_mask,
                original_width: sizeMeasurementData.original_width,
                original_height: sizeMeasurementData.original_height,
                wound_pixels: woundPixels,
                total_pixels:
                  sizeMeasurementData.original_width *
                  sizeMeasurementData.original_height,
                wound_percentage: sizeMeasurementData.dfu_detected
                  ? (sizeMeasurementData.dfu_area_mm2 /
                      ((sizeMeasurementData.original_width *
                        sizeMeasurementData.original_height) /
                        (sizeMeasurementData.px_per_mm *
                          sizeMeasurementData.px_per_mm))) *
                    100
                  : 0,
              };
              setSegmentation(segmentationData);
            }
          } else {
            const errorData: unknown = await sizeMeasurementResponse
              .json()
              .catch(() => ({}));
            if (typeof errorData === 'object' && errorData !== null) {
              recordAudit('/size-measurement', errorData);
            }
            console.log('Size measurement response:', errorData);

            await measurementFailureThenSegmentOnly(
              'Unha não detectada na imagem. Não foi possível calcular o tamanho real da ferida.'
            );
          }
        }
      } catch (sizeMeasurementError) {
        console.error('Size measurement error:', sizeMeasurementError);
        const fallbackMsg: string =
          sizeCalibrationMethod === 'aruco'
            ? 'Falha na calibração ArUco; executando apenas segmentação da ferida.'
            : 'Unha não detectada na imagem. Não foi possível calcular o tamanho real da ferida.';
        await measurementFailureThenSegmentOnly(fallbackMsg);
      }

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
          tryParseSurgwoundModality(exOutcome, '/surgwound/exudate-type', recordAudit),
          tryParseSurgwoundModality(healOutcome, '/surgwound/healing-status', recordAudit),
          tryParseSurgwoundModality(infOutcome, '/surgwound/infection-risk-assessment', recordAudit),
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

      // Step 3: Run tissue classification only if wound area > 0% and we have a mask
      const woundDetected = sizeMeasurementData?.dfu_detected ?? (segmentationData?.wound_percentage ?? 0) > 0;
      if (woundDetected && segmentationData && segmentationData.mask) {
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

        const tissueRaw: unknown = await tissueResponse.json();
        recordAudit('/tissue', tissueRaw);
        const { rest: tissueRest } = splitJsonWithAudit(tissueRaw);
        setTissueResult(tissueRest as TissueResult);

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
              const deepskinRaw: unknown = await deepskinResponse.json();
              recordAudit('/deepskin', deepskinRaw);
              const { rest: dsRest } = splitJsonWithAudit(deepskinRaw);
              if (
                typeof dsRest !== 'object' ||
                dsRest === null ||
                !('pwat_score' in dsRest) ||
                typeof (dsRest as DeepskinResult).pwat_score !== 'number'
              ) {
                throw new TypeError('Resposta Deepskin com formato inválido');
              }
              setDeepskinResult(dsRest as DeepskinResult);
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

      lastPipelineBase64Ref.current = base64Image;
      setPipelineRunComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ocorreu');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleSaveObservation = async () => {
    if (!pipelineRunComplete) {
      setObservationFeedback('Erro: conclua a análise antes de salvar.');
      return;
    }
    const base64Image: string | null = lastPipelineBase64Ref.current;
    if (base64Image === null || base64Image === '') {
      setObservationFeedback('Erro: imagem do pipeline indisponível; execute a análise novamente.');
      return;
    }
    if (!apiUrl) {
      setObservationFeedback('Erro: API não disponível.');
      return;
    }

    const trimmedObservation: string = observationText.trim();
    if (trimmedObservation === '') {
      setObservationFeedback('Erro: digite uma observação antes de salvar.');
      return;
    }

    setIsSavingObservation(true);
    setObservationFeedback(null);

    const outcome: FetchOutcome = await fetchWithNetworkGrace(`${apiUrl}/observation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        observation: trimmedObservation,
      }),
    });

    setIsSavingObservation(false);

    if (outcome.networkError !== null) {
      setObservationFeedback(
        `Erro: falha de rede ao salvar (${outcome.networkError.message}).`
      );
      return;
    }
    if (outcome.response === null) {
      setObservationFeedback('Erro: resposta vazia do servidor.');
      return;
    }

    const response: Response = outcome.response;
    if (!response.ok) {
      let detail: string = `HTTP ${String(response.status)}`;
      try {
        const body: unknown = await response.json();
        if (
          typeof body === 'object' &&
          body !== null &&
          typeof (body as Record<string, unknown>).error === 'string'
        ) {
          detail = (body as Record<string, unknown>).error as string;
        }
      } catch {
        /* ignore */
      }
      setObservationFeedback(`Erro: não foi possível salvar (${detail}).`);
      return;
    }

    const okBody: unknown = await response.json().catch(() => null);
    if (okBody !== null) {
      const { audit } = splitJsonWithAudit(okBody);
      if (
        audit !== null &&
        (audit.image_id !== null || audit.observation_id !== null)
      ) {
        pipelineAuditTrailRef.current.push({
          endpoint: 'POST /observation',
          imageId: audit.image_id,
          inferenceCallId: null,
          observationId: audit.observation_id,
        });
      }
    }

    setObservationFeedback('Observação salva com sucesso.');
  };

  const handleExportPdf = async () => {
    if (!pipelineRunComplete) {
      return;
    }
    setIsExportingPdf(true);
    try {
      const canonicalImageId: string | null =
        pipelineAuditTrailRef.current.find(
          (e: PipelineAuditClientRow) => e.imageId !== null
        )?.imageId ?? null;

      let auditDbRows: PipelineInferenceCallDbRow[] | null = null;
      let auditDbError: string | null = null;
      if (canonicalImageId !== null) {
        const dbOutcome = await supabase
          .from('inference_calls')
          .select('id, endpoint, image_id, created_at')
          .eq('image_id', canonicalImageId)
          .order('id', { ascending: true });
        if (dbOutcome.error !== null) {
          auditDbError = dbOutcome.error.message;
        } else if (dbOutcome.data !== null) {
          const rows: unknown[] = dbOutcome.data as unknown[];
          auditDbRows = rows.map((row: unknown) => {
            const r = row as Record<string, unknown>;
            const ca = r['created_at'];
            return {
              id: String(r['id']),
              endpoint: String(r['endpoint']),
              image_id: String(r['image_id']),
              created_at:
                ca === null || ca === undefined ? null : String(ca),
            };
          });
        }
      }

      const mapSurgwoundRow = (
        r: SurgwoundModalityResult | null
      ): PipelineReportInput['surgwound']['exudate'] => {
        if (r === null) {
          return null;
        }
        return {
          modality: r.modality,
          predicted_label: r.predicted_label,
          confidence: r.confidence,
        };
      };
      const reportInput: PipelineReportInput = {
        apiUrl,
        imageBase64: lastPipelineBase64Ref.current,
        fp: fpResult,
        fpAdvice,
        warnings: {
          nail: nailWarning,
          deepskin: deepskinWarning,
          surgwound: surgwoundWarning,
        },
        segmentation:
          segmentation !== null
            ? {
                wound_percentage: segmentation.wound_percentage,
                wound_pixels: segmentation.wound_pixels,
                original_width: segmentation.original_width,
                original_height: segmentation.original_height,
              }
            : null,
        segmentationVisualization:
          sizeMeasurement !== null && Array.isArray(sizeMeasurement.dfu_mask)
            ? {
                dfu_mask: sizeMeasurement.dfu_mask,
                reference_mask: pickReferenceMaskForOverlay(sizeMeasurement),
                original_width: sizeMeasurement.original_width,
                original_height: sizeMeasurement.original_height,
              }
            : segmentation !== null &&
              Array.isArray(segmentation.mask) &&
              segmentation.mask.length > 0 &&
              segmentation.original_width > 0 &&
              segmentation.original_height > 0
              ? {
                  dfu_mask: segmentation.mask,
                  reference_mask: null,
                  original_width: segmentation.original_width,
                  original_height: segmentation.original_height,
                }
              : null,
        size_calibration_method: sizeCalibrationMethod,
        sizeMeasurement:
          sizeMeasurement !== null
            ? {
                dfu_area_cm2: sizeMeasurement.dfu_area_cm2,
                dfu_area_mm2: sizeMeasurement.dfu_area_mm2,
                nail_detected: sizeMeasurement.nail_detected,
                aruco_detected: sizeMeasurement.aruco_detected === true,
                dfu_detected: sizeMeasurement.dfu_detected,
                px_per_mm: sizeMeasurement.px_per_mm,
                calibration_source: sizeMeasurement.calibration_source,
                dfu_dimensions: {
                  length_mm: sizeMeasurement.dfu_dimensions.length_mm,
                  width_mm: sizeMeasurement.dfu_dimensions.width_mm,
                },
                nail_dimensions:
                  sizeMeasurement.nail_dimensions !== undefined
                    ? sizeMeasurement.nail_dimensions
                    : null,
                printed_marker_square_side_mm:
                  sizeMeasurement.printed_marker_square_side_mm !== undefined
                    ? sizeMeasurement.printed_marker_square_side_mm
                    : null,
                original_width: sizeMeasurement.original_width,
                original_height: sizeMeasurement.original_height,
              }
            : null,
        tissue: tissueResult,
        deepskin: deepskinResult,
        deepskinWarning,
        surgwound: {
          exudate: mapSurgwoundRow(surgwoundExudate),
          healing: mapSurgwoundRow(surgwoundHealing),
          infection: mapSurgwoundRow(surgwoundInfection),
        },
        laser:
          laserDecision !== null
            ? {
                message: laserDecision.message,
                input: {
                  tecido: laserDecision.input.tecido,
                  qtd_exudato: laserDecision.input.qtd_exudato,
                  tipo_exsudato: laserDecision.input.tipo_exsudato,
                  sinais_infeccao: laserDecision.input.sinais_infeccao,
                  status: laserDecision.input.status,
                },
              }
            : null,
        observationDraft: observationText,
        auditClientTrail: pipelineAuditTrailRef.current.slice(),
        auditDbRows,
        auditDbError,
      };
      await downloadPipelineReport(reportInput);
    } catch (exportErr: unknown) {
      const message: string =
        exportErr instanceof Error ? exportErr.message : 'Erro desconhecido ao gerar PDF';
      console.error('Export PDF failed:', exportErr);
      setError(`Falha ao exportar PDF: ${message}`);
    } finally {
      setIsExportingPdf(false);
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
    setFpResult(null);
    setFpAdvice(null);
    setObservationText('');
    setPipelineRunComplete(false);
    setObservationFeedback(null);
    lastPipelineBase64Ref.current = null;
    pipelineAuditTrailRef.current = [];
    setIsSavingObservation(false);
    setIsExportingPdf(false);
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">Detecção de Feridas</h1>
              {apiUrl && (
                <p className="text-xs mt-1 opacity-90">API Ativa</p>
              )}
            </div>
            <Link
              href="/inferences"
              className="shrink-0 rounded-md bg-white/15 px-2 py-1.5 text-xs font-medium text-white hover:bg-white/25"
            >
              <span className="inline-flex items-center gap-1">
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Inferências
              </span>
            </Link>
          </div>
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

          {nailWarning && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded">
              <p className="text-sm text-amber-900 font-medium">Aviso</p>
              <p className="text-xs text-amber-800 mt-1">{nailWarning}</p>
            </div>
          )}

          {/* FP Pre-check Result */}
          {fpResult && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Pré-checagem FP
              </h2>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <span className="font-medium">Classe prevista:</span> {fpResult.predicted_class}
                </p>
                <p>
                  <span className="font-medium">Precisa refazer foto:</span>{' '}
                  {fpResult.needs_retry_photo ? 'Sim' : 'Não'}
                </p>
              </div>
              {fpAdvice && (
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mt-3 rounded">
                  <p className="text-xs text-yellow-800">{fpAdvice}</p>
                </div>
              )}
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
                <>
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <SizeCalibrationRadios
                      value={sizeCalibrationMethod}
                      onChange={setSizeCalibrationMethod}
                      disabled={isLoading}
                      layout="mobile"
                    />
                    {sizeCalibrationMethod === 'aruco' && (
                      <ArucoMarkerSideCmField
                        valueCm={arucoMarkerSideCm}
                        onChangeValueCm={setArucoMarkerSideCm}
                        disabled={isLoading}
                        layout="mobile"
                      />
                    )}
                  </div>
                  <button
                    onClick={handleUploadAndPredict}
                    disabled={!selectedFile}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium mt-3 active:bg-blue-700 disabled:bg-gray-400"
                  >
                    Analisar Imagem
                  </button>
                </>
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
          {(segmentation || sizeMeasurement) && (maskImageUrl || combinedMaskImageUrl) && (
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
                      src={combinedMaskImageUrl || maskImageUrl || ''}
                      alt="Máscara"
                      className="absolute top-0 left-0 w-full"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  </div>
                  {/* Legend */}
                  {sizeMeasurement !== null &&
                    pickReferenceMaskForOverlay(sizeMeasurement) !== null && (
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded bg-blue-500" /> Ferida
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded bg-green-500" />
                        {sizeMeasurement.aruco_detected === true ? 'Marcadores ArUco' : 'Referência (unha)'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Área da Ferida</p>
                  <p className="text-xl font-bold text-gray-900">
                    {segmentation?.wound_percentage?.toFixed(2) ?? '0.00'}%
                  </p>
                  {(segmentation?.wound_percentage === 0 && !sizeMeasurement?.dfu_detected) && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Nenhuma ferida detectada
                    </p>
                  )}
                </div>

                {sizeMeasurement !== null && (
                  <div
                    className={`rounded-lg p-3 ${
                      sizeCalibrationMethod === 'nail'
                        ? sizeMeasurement.nail_detected
                          ? 'bg-green-50'
                          : 'bg-amber-50'
                        : sizeMeasurement.aruco_detected === true
                          ? 'bg-green-50'
                          : 'bg-amber-50'
                    }`}
                  >
                    <p className="text-xs text-gray-600 mb-1">
                      {sizeCalibrationMethod === 'nail'
                        ? 'Detecção de Unha'
                        : 'Marcadores ArUco (ids 0 e 1)'}
                    </p>
                    <p
                      className={`text-base font-bold ${
                        sizeCalibrationMethod === 'nail'
                          ? sizeMeasurement.nail_detected
                            ? 'text-green-700'
                            : 'text-amber-700'
                          : sizeMeasurement.aruco_detected === true
                            ? 'text-green-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {sizeCalibrationMethod === 'nail'
                        ? sizeMeasurement.nail_detected
                          ? 'Detectada'
                          : 'Não detectada'
                        : sizeMeasurement.aruco_detected === true
                          ? 'Detectados'
                          : 'Não detectados'}
                    </p>
                  </div>
                )}

                {showRealWorldSizing(sizeMeasurement, sizeCalibrationMethod) && sizeMeasurement !== null && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Tamanho Estimado da Ferida</p>
                      <p className="text-xl font-bold text-blue-700">
                        {sizeMeasurement.dfu_area_cm2.toFixed(2)} cm²
                      </p>
                      <p className="text-xs text-blue-800 mt-1">
                        {sizeMeasurement.dfu_dimensions.length_mm.toFixed(1)}mm ×{' '}
                        {sizeMeasurement.dfu_dimensions.width_mm.toFixed(1)}mm
                      </p>
                    </div>

                    {sizeCalibrationMethod === 'nail' &&
                      sizeMeasurement.nail_dimensions !== undefined && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Tamanho da unha considerado</p>
                          <p className="text-sm font-medium text-gray-900">
                            {sizeMeasurement.nail_dimensions.length_mm.toFixed(1)}mm ×{' '}
                            {sizeMeasurement.nail_dimensions.width_mm.toFixed(1)}mm
                          </p>
                          <p className="text-xs text-amber-700 mt-2">
                            Estimativa considera que a unha e a ferida estão à mesma distância da
                            câmera
                          </p>
                        </div>
                      )}

                    {sizeCalibrationMethod === 'aruco' &&
                      typeof sizeMeasurement.printed_marker_square_side_mm === 'number' && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Marcadores (calibração)</p>
                          <p className="text-sm font-medium text-gray-900">
                            Lado físico:{' '}
                            {sizeMeasurement.printed_marker_square_side_mm.toFixed(1)} mm cada
                            (média px/mm dos ids 0 e 1)
                          </p>
                          <p className="text-xs text-amber-700 mt-2">
                            Escala a partir da média dos dois marcadores na mesma tira.
                          </p>
                        </div>
                      )}
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-1">Pixels</p>
                    <p className="text-base font-bold text-gray-900">
                      {segmentation?.wound_pixels?.toLocaleString() ?? '0'}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-1">Tamanho</p>
                    <p className="text-base font-bold text-gray-900">
                      {segmentation?.original_width ?? sizeMeasurement?.original_width ?? 0}x{segmentation?.original_height ?? sizeMeasurement?.original_height ?? 0}
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

          {laserDecision !== null && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4 space-y-3">
              <h2 className="text-base font-semibold text-gray-800">Análise de Modulação Laser</h2>
              <div className={`rounded-lg border p-3 ${getLaserDecisionContainerClass(laserDecision.kind)}`}>
                <p className="text-sm font-medium text-gray-900">{laserDecision.message}</p>
                <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-700">
                  <p>
                    <span className="font-medium">Tecido:</span>{' '}
                    {laserDecision.input.tecido ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Qtd. exsudato:</span>{' '}
                    {laserDecision.input.qtd_exudato ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Tipo de exsudato:</span>{' '}
                    {laserDecision.input.tipo_exsudato ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Status:</span> {laserDecision.input.status ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Sinais de infecção:</span>{' '}
                    {laserDecision.input.sinais_infeccao ? 'Sim' : 'Não'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {pipelineRunComplete && (
            <>
              <PdfExportSection
                layout="mobile"
                isExporting={isExportingPdf}
                onExport={handleExportPdf}
              />
              <ObservationSection
                observationText={observationText}
                onObservationChange={setObservationText}
                onSave={handleSaveObservation}
                isSaving={isSavingObservation}
                feedback={observationFeedback}
                layout="mobile"
              />
            </>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Demonstração do Pipeline de Detecção de DFU
            </h1>
            <Link
              href="/inferences"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
              Ver inferências
            </Link>
          </div>

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

              <SizeCalibrationRadios
                value={sizeCalibrationMethod}
                onChange={setSizeCalibrationMethod}
                disabled={isLoading}
                layout="desktop"
              />
              {sizeCalibrationMethod === 'aruco' && (
                <ArucoMarkerSideCmField
                  valueCm={arucoMarkerSideCm}
                  onChangeValueCm={setArucoMarkerSideCm}
                  disabled={isLoading}
                  layout="desktop"
                />
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

          {nailWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h3 className="text-amber-900 font-semibold mb-1">Aviso</h3>
              <p className="text-amber-800">{nailWarning}</p>
            </div>
          )}

          {fpResult && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Pré-checagem FP
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <p>
                  <span className="font-semibold">Classe prevista:</span> {fpResult.predicted_class}
                </p>
                <p>
                  <span className="font-semibold">Precisa refazer foto:</span>{' '}
                  {fpResult.needs_retry_photo ? 'Sim' : 'Não'}
                </p>
              </div>
              {fpAdvice && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                  <p className="text-yellow-800 font-medium">{fpAdvice}</p>
                </div>
              )}
            </div>
          )}

          {(segmentation || sizeMeasurement) && (maskImageUrl || combinedMaskImageUrl) && (
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
                      src={combinedMaskImageUrl || maskImageUrl || ''}
                      alt="Máscara"
                      className="absolute top-0 left-0 h-auto w-full"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  </div>
                  {/* Legend */}
                  {sizeMeasurement !== null &&
                    pickReferenceMaskForOverlay(sizeMeasurement) !== null && (
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 rounded bg-blue-500" /> Ferida
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 rounded bg-green-500" />
                        {sizeMeasurement.aruco_detected === true ? 'Marcadores ArUco' : 'Referência (unha)'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Área da Ferida</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation?.wound_percentage?.toFixed(2) ?? '0.00'}%
                  </p>
                  {(segmentation?.wound_percentage === 0 && !sizeMeasurement?.dfu_detected) && (
                    <p className="text-xs text-yellow-600 mt-2">
                      Nenhuma ferida detectada
                    </p>
                  )}
                </div>

                {sizeMeasurement !== null ? (
                  <div
                    className={`rounded-lg p-4 ${
                      sizeCalibrationMethod === 'nail'
                        ? sizeMeasurement.nail_detected
                          ? 'bg-green-50'
                          : 'bg-amber-50'
                        : sizeMeasurement.aruco_detected === true
                          ? 'bg-green-50'
                          : 'bg-amber-50'
                    }`}
                  >
                    <p className="text-sm text-gray-600 mb-1">
                      {sizeCalibrationMethod === 'nail'
                        ? 'Detecção de Unha'
                        : 'Marcadores ArUco (0 e 1)'}
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        sizeCalibrationMethod === 'nail'
                          ? sizeMeasurement.nail_detected
                            ? 'text-green-700'
                            : 'text-amber-700'
                          : sizeMeasurement.aruco_detected === true
                            ? 'text-green-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {sizeCalibrationMethod === 'nail'
                        ? sizeMeasurement.nail_detected
                          ? 'Detectada'
                          : 'Não detectada'
                        : sizeMeasurement.aruco_detected === true
                          ? 'Detectados'
                          : 'Não detectados'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-600 mb-1">Calibração de escala</p>
                    <p className="text-sm font-medium text-gray-500">Indisponível (apenas segmentação)</p>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Pixels da Ferida</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation?.wound_pixels?.toLocaleString() ?? '0'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Tamanho da Imagem</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {segmentation?.original_width ?? sizeMeasurement?.original_width ?? 0}x{segmentation?.original_height ?? sizeMeasurement?.original_height ?? 0}
                  </p>
                </div>
              </div>

              {/* Size measurement (physical scale from ArUco or nail) */}
              {showRealWorldSizing(sizeMeasurement, sizeCalibrationMethod) &&
                sizeMeasurement !== null && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="mb-3 text-lg font-semibold text-gray-800">
                      Medição de Tamanho
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                        <p className="mb-1 text-sm font-medium text-blue-800">
                          Tamanho Estimado da Ferida
                        </p>
                        <p className="text-3xl font-bold text-blue-900">
                          {sizeMeasurement.dfu_area_cm2.toFixed(2)} cm²
                        </p>
                        <p className="mt-1 text-sm text-blue-700">
                          ({sizeMeasurement.dfu_dimensions.length_mm.toFixed(1)}mm ×{' '}
                          {sizeMeasurement.dfu_dimensions.width_mm.toFixed(1)}mm)
                        </p>
                      </div>

                      {sizeCalibrationMethod === 'nail' &&
                        sizeMeasurement.nail_dimensions !== undefined && (
                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="mb-1 text-sm font-medium text-gray-700">
                              Tamanho da Unha Considerado
                            </p>
                            <p className="text-xl font-bold text-gray-900">
                              {sizeMeasurement.nail_dimensions.length_mm.toFixed(1)}mm ×{' '}
                              {sizeMeasurement.nail_dimensions.width_mm.toFixed(1)}mm
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Fonte:{' '}
                              {sizeMeasurement.calibration_source === 'user_provided'
                                ? 'Fornecido pelo usuário'
                                : 'Média populacional'}
                            </p>
                          </div>
                        )}

                      {sizeCalibrationMethod === 'aruco' &&
                        typeof sizeMeasurement.printed_marker_square_side_mm === 'number' && (
                          <div className="rounded-lg bg-gray-50 p-4">
                            <p className="mb-1 text-sm font-medium text-gray-700">
                              Marcadores (calibração)
                            </p>
                            <p className="text-xl font-bold text-gray-900">
                              Lado físico:{' '}
                              {sizeMeasurement.printed_marker_square_side_mm.toFixed(1)} mm cada
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Escala: média px/mm dos marcadores ids 0 e 1 ({sizeMeasurement.calibration_source})
                            </p>
                          </div>
                        )}
                    </div>

                    {sizeCalibrationMethod === 'nail' ? (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm text-amber-800">
                          <span className="font-semibold">Nota:</span> A estimativa considera que a unha e
                          a ferida estão à mesma distância da câmera.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm text-amber-800">
                          <span className="font-semibold">Nota:</span> A escala segue a média dos dois
                          marcadores ArUco impressos ao lado da ferida na mesma tira.
                        </p>
                      </div>
                    )}
                  </div>
                )}
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

          {laserDecision !== null && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-800">Análise de Modulação Laser</h2>
              <div className={`rounded-lg border p-4 ${getLaserDecisionContainerClass(laserDecision.kind)}`}>
                <p className="text-base font-semibold text-gray-900">{laserDecision.message}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-2">
                  <p>
                    <span className="font-semibold">Tecido:</span> {laserDecision.input.tecido ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Qtd. exsudato:</span>{' '}
                    {laserDecision.input.qtd_exudato ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Tipo de exsudato:</span>{' '}
                    {laserDecision.input.tipo_exsudato ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span> {laserDecision.input.status ?? 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Sinais de infecção:</span>{' '}
                    {laserDecision.input.sinais_infeccao ? 'Sim' : 'Não'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {pipelineRunComplete && (
            <>
              <PdfExportSection
                layout="desktop"
                isExporting={isExportingPdf}
                onExport={handleExportPdf}
              />
              <ObservationSection
                observationText={observationText}
                onObservationChange={setObservationText}
                onSave={handleSaveObservation}
                isSaving={isSavingObservation}
                feedback={observationFeedback}
                layout="desktop"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

