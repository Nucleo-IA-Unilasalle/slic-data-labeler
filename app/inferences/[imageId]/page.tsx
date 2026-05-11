'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ChevronDown, ImageOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

import {
  formatInferenceTimestamp,
  isProbablyMissingCreatedAtColumn,
  parseIsoTimestamp,
} from '../formatInferenceDate';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const INFERENCE_IMAGES_BUCKET = 'inference-images';
const SIGNED_URL_TTL_SECONDS = 7200;

interface InferenceDetailRow {
  id: string;
  endpoint: string;
  image_id: string;
  result: unknown;
  created_at: string | null;
}

interface ObservationRow {
  id: string;
  observation: string;
  created_at: string | null;
}

function sessionDateRangeLabel(rows: InferenceDetailRow[]): string | null {
  const timestamps: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const t = rows[i].created_at;
    if (t !== null && t !== '') {
      timestamps.push(t);
    }
  }
  if (timestamps.length === 0) {
    return null;
  }
  const sorted = [...timestamps].sort((x, y) => x.localeCompare(y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) {
    return `Registrado em ${formatInferenceTimestamp(first)}`;
  }
  return `De ${formatInferenceTimestamp(first)} até ${formatInferenceTimestamp(last)}`;
}

async function fetchCallsForImage(params: {
  client: SupabaseClient;
  imageId: string;
}): Promise<{ rows: InferenceDetailRow[]; errorMessage: string | null }> {
  const { client, imageId } = params;
  const primary = await client
    .from('inference_calls')
    .select('id, endpoint, image_id, result, created_at')
    .eq('image_id', imageId)
    .order('created_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true });

  let dataPayload: Record<string, unknown>[] = [];
  let includeCreatedAt = true;

  if (primary.error !== null) {
    if (isProbablyMissingCreatedAtColumn(primary.error.message)) {
      includeCreatedAt = false;
      const legacy = await client
        .from('inference_calls')
        .select('id, endpoint, image_id, result')
        .eq('image_id', imageId)
        .order('id', { ascending: true });
      if (legacy.error !== null) {
        return { rows: [], errorMessage: legacy.error.message };
      }
      if (!Array.isArray(legacy.data)) {
        return { rows: [], errorMessage: 'Resposta inválida do Supabase.' };
      }
      dataPayload = legacy.data as Record<string, unknown>[];
    } else {
      return { rows: [], errorMessage: primary.error.message };
    }
  } else if (Array.isArray(primary.data)) {
    dataPayload = primary.data as Record<string, unknown>[];
  } else {
    return { rows: [], errorMessage: 'Resposta inválida do Supabase.' };
  }

  const rows: InferenceDetailRow[] = [];
  for (let i = 0; i < dataPayload.length; i += 1) {
    const raw = dataPayload[i];
    const id = raw['id'];
    const endpoint = raw['endpoint'];
    const image_id = raw['image_id'];
    if (
      typeof id === 'string' &&
      typeof endpoint === 'string' &&
      typeof image_id === 'string'
    ) {
      rows.push({
        id,
        endpoint,
        image_id,
        result: raw['result'],
        created_at: includeCreatedAt ? parseIsoTimestamp(raw['created_at']) : null,
      });
    }
  }
  return { rows, errorMessage: null };
}

async function fetchObservationsForImage(params: {
  client: SupabaseClient;
  imageId: string;
}): Promise<{ rows: ObservationRow[]; errorMessage: string | null }> {
  const { client, imageId } = params;
  const primary = await client
    .from('inference_observations')
    .select('id, observation, created_at')
    .eq('image_id', imageId)
    .order('created_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true });

  let observationsData: Record<string, unknown>[] = [];
  let includeCreatedAtObs = true;

  if (primary.error !== null) {
    if (isProbablyMissingCreatedAtColumn(primary.error.message)) {
      includeCreatedAtObs = false;
      const legacy = await client
        .from('inference_observations')
        .select('id, observation')
        .eq('image_id', imageId)
        .order('id', { ascending: true });
      if (legacy.error !== null) {
        return { rows: [], errorMessage: legacy.error.message };
      }
      if (!Array.isArray(legacy.data)) {
        return { rows: [], errorMessage: null };
      }
      observationsData = legacy.data as Record<string, unknown>[];
    } else {
      return { rows: [], errorMessage: primary.error.message };
    }
  } else if (Array.isArray(primary.data)) {
    observationsData = primary.data as Record<string, unknown>[];
  } else {
    return { rows: [], errorMessage: null };
  }

  const rows: ObservationRow[] = [];
  for (let j = 0; j < observationsData.length; j += 1) {
    const raw = observationsData[j];
    const id = raw['id'];
    const observation = raw['observation'];
    if (typeof id === 'string' && typeof observation === 'string') {
      rows.push({
        id,
        observation,
        created_at: includeCreatedAtObs
          ? parseIsoTimestamp(raw['created_at'])
          : null,
      });
    }
  }
  return { rows, errorMessage: null };
}

async function resolveFullImageUrl(params: {
  client: SupabaseClient;
  bucket: string;
  imageId: string;
  signedTtlSeconds: number;
}): Promise<string | null> {
  const { client, bucket, imageId, signedTtlSeconds } = params;
  const path = `${imageId}.jpg`;
  const signed = await client.storage.from(bucket).createSignedUrl(path, signedTtlSeconds);
  if (
    signed.error === null &&
    signed.data !== null &&
    signed.data.signedUrl !== ''
  ) {
    return signed.data.signedUrl;
  }
  const pub = client.storage.from(bucket).getPublicUrl(path);
  const url = pub.data.publicUrl;
  return url !== '' ? url : null;
}

function InferenceResultBlock(props: { payload: unknown }): ReactElement {
  const { payload } = props;
  const text =
    payload === undefined
      ? '{}'
      : JSON.stringify(payload, null, 2);
  return (
    <details className="group rounded-lg border border-gray-200 bg-gray-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
        Payload (result)
      </summary>
      <pre className="max-h-[min(24rem,50vh)] overflow-auto border-t border-gray-200 p-3 text-xs text-gray-800">
        {text}
      </pre>
    </details>
  );
}

export default function InferenceDetailPage(): ReactElement {
  const params = useParams();
  const imageIdParam =
    typeof params.imageId === 'string' ? params.imageId.trim() : '';

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState<boolean>(false);
  const [calls, setCalls] = useState<InferenceDetailRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [callsQueryError, setCallsQueryError] = useState<string | null>(null);
  const [obsError, setObsError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      if (imageIdParam === '') {
        setCallsQueryError('Identificador de imagem ausente ou inválido.');
        setLoading(false);
        return;
      }
      if (supabaseUrl === '' || supabaseKey === '') {
        setCallsQueryError(
          'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
        );
        setLoading(false);
        return;
      }

      const client = createClient(supabaseUrl, supabaseKey);
      setLoading(true);
      setCallsQueryError(null);
      setObsError(null);

      const [callsOutcome, imgUrl] = await Promise.all([
        fetchCallsForImage({ client, imageId: imageIdParam }),
        resolveFullImageUrl({
          client,
          bucket: INFERENCE_IMAGES_BUCKET,
          imageId: imageIdParam,
          signedTtlSeconds: SIGNED_URL_TTL_SECONDS,
        }),
      ]);

      if (cancelled) {
        return;
      }

      if (callsOutcome.errorMessage !== null) {
        setCallsQueryError(callsOutcome.errorMessage);
        setCalls([]);
      } else {
        setCalls(callsOutcome.rows);
        setCallsQueryError(null);
      }

      const obsOutcome = await fetchObservationsForImage({
        client,
        imageId: imageIdParam,
      });
      if (cancelled) {
        return;
      }
      if (obsOutcome.errorMessage !== null) {
        setObsError(obsOutcome.errorMessage);
        setObservations([]);
      } else {
        setObservations(obsOutcome.rows);
        setObsError(null);
      }

      setImageUrl(imgUrl);
      setImageBroken(false);
      setLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [imageIdParam]);

  const callsDateSummary: string | null =
    calls.length > 0 ? sessionDateRangeLabel(calls) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/inferences"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Lista de inferências
            </Link>
          </div>
          <h1 className="break-all font-mono text-sm font-bold text-gray-900 md:text-xl">
            {imageIdParam || '—'}
          </h1>
          {callsDateSummary !== null && (
            <p className="text-sm text-gray-600">{callsDateSummary}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading && (
          <div className="flex justify-center py-16 text-gray-600">
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
          </div>
        )}

        {!loading && callsQueryError !== null && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
            <p className="font-medium">{callsQueryError}</p>
          </div>
        )}

        {!loading && callsQueryError === null && calls.length === 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">
              Nenhuma linha em <code className="text-xs">inference_calls</code> para este{' '}
              <code className="text-xs">image_id</code>.
            </p>
          </div>
        )}

        {!loading && imageIdParam !== '' && (
          <section className="mb-10 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="relative aspect-video max-h-[28rem] w-full bg-gray-100 md:aspect-auto md:min-h-[20rem]">
              {imageUrl !== null && imageUrl !== '' && !imageBroken ? (
                <img
                  src={imageUrl}
                  alt={`Registro ${imageIdParam}`}
                  className="h-full max-h-[28rem] w-full object-contain"
                  onError={() => {
                    setImageBroken(true);
                  }}
                />
              ) : (
                <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-gray-500">
                  <ImageOff className="h-12 w-12" aria-hidden />
                  <span className="text-sm">Imagem não disponível no storage</span>
                </div>
              )}
            </div>
          </section>
        )}

        {!loading && calls.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Chamadas de inferência ({String(calls.length)})
            </h2>
            <ul className="flex flex-col gap-4">
              {calls.map((row) => (
                <li
                  key={row.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 gap-y-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {row.endpoint}
                    </Badge>
                    <span className="font-mono text-xs text-gray-500">id={row.id}</span>
                    <span className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Data: </span>
                      {formatInferenceTimestamp(row.created_at)}
                    </span>
                  </div>
                  <InferenceResultBlock payload={row.result} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && (observations.length > 0 || obsError !== null) && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Observações</h2>
            {obsError !== null ? (
              <p className="text-sm text-amber-800">
                Observações não carregadas ({obsError}). Ajuste RLS em inference_observations se
                necessário.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {observations.map((obs) => (
                  <li
                    key={obs.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <p className="mb-1 font-mono text-xs text-gray-500">
                      inference_observations.id={obs.id}
                    </p>
                    <p className="mb-2 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Data: </span>
                      {formatInferenceTimestamp(obs.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{obs.observation}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
