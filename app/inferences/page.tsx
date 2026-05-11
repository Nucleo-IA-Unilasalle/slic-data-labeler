'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ImageOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

import {
  formatInferenceTimestamp,
  isProbablyMissingCreatedAtColumn,
  parseIsoTimestamp,
} from './formatInferenceDate';

interface InferenceCallRow {
  id: string;
  image_id: string;
  endpoint: string;
  created_at: string | null;
}

interface InferenceImageGroup {
  imageId: string;
  callCount: number;
  endpoints: string[];
  lastInferenceAt: string | null;
}

function groupInferenceRows(rows: InferenceCallRow[]): InferenceImageGroup[] {
  const byImage = new Map<
    string,
    { endpoints: Set<string>; count: number; maxId: string; latestAt: string | null }
  >();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let cur = byImage.get(row.image_id);
    if (cur === undefined) {
      cur = { endpoints: new Set(), count: 0, maxId: row.id, latestAt: null };
      byImage.set(row.image_id, cur);
    }
    cur.endpoints.add(row.endpoint);
    cur.count += 1;
    if (row.id > cur.maxId) {
      cur.maxId = row.id;
    }
    if (row.created_at !== null) {
      if (cur.latestAt === null || row.created_at > cur.latestAt) {
        cur.latestAt = row.created_at;
      }
    }
  }
  const items: Array<InferenceImageGroup & { maxId: string }> = [];
  for (const [imageId, v] of byImage.entries()) {
    items.push({
      imageId,
      callCount: v.count,
      endpoints: [...v.endpoints].sort((a, b) => a.localeCompare(b)),
      maxId: v.maxId,
      lastInferenceAt: v.latestAt,
    });
  }
  items.sort((a, b) => {
    if (a.lastInferenceAt !== null && b.lastInferenceAt !== null) {
      if (a.lastInferenceAt > b.lastInferenceAt) {
        return -1;
      }
      if (a.lastInferenceAt < b.lastInferenceAt) {
        return 1;
      }
    }
    if (a.lastInferenceAt !== null && b.lastInferenceAt === null) {
      return -1;
    }
    if (a.lastInferenceAt === null && b.lastInferenceAt !== null) {
      return 1;
    }
    if (a.maxId > b.maxId) {
      return -1;
    }
    if (a.maxId < b.maxId) {
      return 1;
    }
    return 0;
  });
  return items.map(({ imageId, callCount, endpoints, lastInferenceAt }) => ({
    imageId,
    callCount,
    endpoints,
    lastInferenceAt,
  }));
}

function mapRawRowToInferenceCall(
  raw: Record<string, unknown>,
  hasCreatedAt: boolean
): InferenceCallRow | null {
  const id = raw['id'];
  const image_id = raw['image_id'];
  const endpoint = raw['endpoint'];
  if (
    typeof id !== 'string' ||
    typeof image_id !== 'string' ||
    typeof endpoint !== 'string'
  ) {
    return null;
  }
  const created_raw = raw['created_at'];
  const created_at: string | null = hasCreatedAt ? parseIsoTimestamp(created_raw) : null;
  return { id, image_id, endpoint, created_at };
}

async function fetchInferenceRows(params: {
  client: SupabaseClient;
  limit: number;
}): Promise<{ rows: InferenceCallRow[]; errorMessage: string | null }> {
  const { client, limit } = params;
  const primary = await client
    .from('inference_calls')
    .select('id, image_id, endpoint, created_at')
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit);

  let useCreatedAt = true;

  if (primary.error !== null) {
    if (isProbablyMissingCreatedAtColumn(primary.error.message)) {
      useCreatedAt = false;
    } else {
      return { rows: [], errorMessage: primary.error.message };
    }
  }

  let dataRows: Record<string, unknown>[] = [];

  if (primary.error !== null && useCreatedAt === false) {
    const legacy = await client
      .from('inference_calls')
      .select('id, image_id, endpoint')
      .order('id', { ascending: false })
      .limit(limit);
    if (legacy.error !== null) {
      return { rows: [], errorMessage: legacy.error.message };
    }
    if (!Array.isArray(legacy.data)) {
      return { rows: [], errorMessage: 'Resposta inválida do Supabase.' };
    }
    dataRows = legacy.data as Record<string, unknown>[];
    useCreatedAt = false;
  } else if (primary.data !== null && Array.isArray(primary.data)) {
    dataRows = primary.data as Record<string, unknown>[];
  } else if (primary.data === null || !Array.isArray(primary.data)) {
    return { rows: [], errorMessage: 'Resposta inválida do Supabase.' };
  }

  const rows: InferenceCallRow[] = [];
  for (let i = 0; i < dataRows.length; i += 1) {
    const mapped = mapRawRowToInferenceCall(dataRows[i], useCreatedAt);
    if (mapped !== null) {
      rows.push(mapped);
    }
  }
  return { rows, errorMessage: null };
}

async function resolveThumbnailUrl(params: {
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const FETCH_LIMIT = 2000;
const INFERENCE_IMAGES_BUCKET = 'inference-images';
const SIGNED_URL_TTL_SECONDS = 3600;

export default function InferencesGalleryPage() {
  const [groups, setGroups] = useState<InferenceImageGroup[]>([]);
  const [thumbByImageId, setThumbByImageId] = useState<Record<string, string | null>>(
    {}
  );
  const [brokenThumbIds, setBrokenThumbIds] = useState<Set<string>>(
    () => new Set()
  );
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingThumbs, setLoadingThumbs] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      if (supabaseUrl === '' || supabaseKey === '') {
        setListError(
          'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
        );
        setLoadingList(false);
        return;
      }
      const client = createClient(supabaseUrl, supabaseKey);
      setLoadingList(true);
      setListError(null);
      setThumbByImageId({});
      setBrokenThumbIds(new Set());

      const { rows, errorMessage } = await fetchInferenceRows({
        client,
        limit: FETCH_LIMIT,
      });
      if (cancelled) {
        return;
      }
      if (errorMessage !== null) {
        setListError(errorMessage);
        setGroups([]);
        setLoadingList(false);
        return;
      }
      const grouped = groupInferenceRows(rows);
      setGroups(grouped);
      setLoadingList(false);

      if (grouped.length === 0) {
        return;
      }
      setLoadingThumbs(true);
      const results = await Promise.all(
        grouped.map(async (item) => {
          const url = await resolveThumbnailUrl({
            client,
            bucket: INFERENCE_IMAGES_BUCKET,
            imageId: item.imageId,
            signedTtlSeconds: SIGNED_URL_TTL_SECONDS,
          });
          return { imageId: item.imageId, url };
        })
      );
      if (cancelled) {
        return;
      }
      const map: Record<string, string | null> = {};
      for (let j = 0; j < results.length; j += 1) {
        const r = results[j];
        map[r.imageId] = r.url;
      }
      setThumbByImageId(map);
      setLoadingThumbs(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inferências registradas</h1>
            <p className="mt-1 text-sm text-gray-600">
              Agrupadas por imagem (até {String(FETCH_LIMIT)} linhas recentes em{' '}
              <code className="rounded bg-gray-100 px-1 text-xs">inference_calls</code>
              ). A data exibida usa <code className="rounded bg-gray-100 px-1 text-xs">created_at</code>{' '}
              em cada linha quando a coluna existir (veja{' '}
              <code className="rounded bg-gray-100 px-1 text-xs">supabase/migrations</code>). Miniaturas
              vêm de <code className="rounded bg-gray-100 px-1 text-xs">inference-images</code>.
            </p>
          </div>
          <Link
            href="/pipeline-demo"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Pipeline
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {loadingList && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-600">
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
            <p className="text-sm">Carregando inferências…</p>
          </div>
        )}

        {!loadingList && listError !== null && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-semibold">Não foi possível carregar a lista</p>
            <p className="mt-1 text-sm">{listError}</p>
            <p className="mt-2 text-sm text-red-700">
              Confirme políticas RLS de leitura em <code>inference_calls</code> e permissões
              de leitura no storage para o papel <code>anon</code>, se aplicável.
            </p>
          </div>
        )}

        {!loadingList && listError === null && groups.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">
            Nenhuma inferência encontrada.
          </p>
        )}

        {!loadingList && listError === null && groups.length > 0 && (
          <>
            {loadingThumbs && (
              <p className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Gerando URLs das miniaturas…
              </p>
            )}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {groups.map((g) => {
                const rawThumb: string | null | undefined = thumbByImageId[g.imageId];
                const thumbUrl: string | undefined =
                  typeof rawThumb === 'string' ? rawThumb : undefined;
                const isBroken: boolean = brokenThumbIds.has(g.imageId);
                const showSpinner: boolean =
                  loadingThumbs && !(g.imageId in thumbByImageId);
                const canShowImage: boolean =
                  !showSpinner &&
                  thumbUrl !== undefined &&
                  thumbUrl !== '' &&
                  !isBroken;

                return (
                  <li key={g.imageId}>
                    <Link
                      href={`/inferences/${encodeURIComponent(g.imageId)}`}
                      aria-label={`Ver detalhes da imagem ${g.imageId}`}
                      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow group-hover:shadow-md">
                        <div className="relative aspect-square bg-gray-100">
                        {showSpinner ? (
                          <div className="flex h-full items-center justify-center">
                            <Loader2
                              className="h-8 w-8 animate-spin text-gray-400"
                              aria-hidden
                            />
                          </div>
                        ) : !canShowImage ? (
                          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-gray-500">
                            <ImageOff className="h-10 w-10 shrink-0" aria-hidden />
                            <span className="text-xs">Miniatura indisponível</span>
                          </div>
                        ) : (
                          <img
                            src={thumbUrl}
                            alt={`Miniatura registrada ${g.imageId}`}
                            className="h-full w-full object-cover"
                            onError={() => {
                              setBrokenThumbIds((prev) => {
                                const next = new Set(prev);
                                next.add(g.imageId);
                                return next;
                              });
                            }}
                          />
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="secondary" className="shrink-0 font-normal">
                            {String(g.callCount)}{' '}
                            {g.callCount === 1 ? 'chamada' : 'chamadas'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600" title={g.lastInferenceAt ?? undefined}>
                          <span className="font-medium text-gray-700">Última: </span>
                          {formatInferenceTimestamp(g.lastInferenceAt)}
                        </p>
                        <p
                          className="truncate font-mono text-[11px] leading-tight text-gray-700"
                          title={g.imageId}
                        >
                          {g.imageId}
                        </p>
                        <p
                          className="line-clamp-3 text-xs text-gray-500"
                          title={g.endpoints.join(', ')}
                        >
                          {g.endpoints.join(' · ')}
                        </p>
                      </div>
                    </article>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
