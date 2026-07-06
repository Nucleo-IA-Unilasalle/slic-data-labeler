import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getDosageSuggestionFromPdfRules } from '@/lib/dosage/dosage-rules';
import type { DosageContext, PresentationMode } from '@/lib/dosage/types';
import { isDemoMode, getDemoContext } from '@/lib/dosage/demo';

interface PredictionRow {
  image_name: string;
  qtd_exudado?: string;
  tissue_type?: string;
}

function isPresentationMode(value: string | null): value is PresentationMode {
  return value === 'blind' || value === 'context' || value === 'suggestion_review';
}

function candidateImageNames(imageName: string): string[] {
  const parts = imageName.split('_');
  const suffixName = parts.length >= 3 ? parts.slice(2).join('_') : imageName;
  return Array.from(new Set([imageName, suffixName]));
}

async function readCsvPrediction(imageName: string, filename: string): Promise<PredictionRow | null> {
  try {
    const csvPath = join(process.cwd(), 'app', 'api', 'supervision', filename);
    const content = await readFile(csvPath, 'utf-8');
    const [headerLine, ...lines] = content.trim().split('\n');
    const headers = headerLine.split(',');
    const candidates = new Set(candidateImageNames(imageName));
    const row = lines.find((line) => candidates.has(line.split(',')[0] ?? ''));

    if (!row) return null;

    const values = row.split(',');
    const parsedRow = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    return {
      image_name: parsedRow.image_name ?? values[0] ?? '',
      qtd_exudado: parsedRow.qtd_exudado,
      tissue_type: parsedRow.tissue_type,
    };
  } catch {
    return null;
  }
}

function deriveDosageContext(slic: PredictionRow | null, vlm: PredictionRow | null): DosageContext {
  const primary = slic ?? vlm;
  const tissueType = primary?.tissue_type?.toLowerCase();
  const exudateAmount = primary?.qtd_exudado;

  return {
    tissue: {
      epithelial: tissueType === 'epitelial' ? 1 : 0,
      slough: tissueType === 'esfacelo' ? 1 : 0,
      granulation: tissueType === 'granulação' || tissueType === 'granulacao' ? 1 : 0,
      necrotic: tissueType === 'necrótico' || tissueType === 'necrotico' ? 1 : 0,
      dominant: tissueType,
    },
    exudate: {
      amount: exudateAmount,
    },
    flags: {
      extensiveNecrosis: tissueType === 'necrótico' || tissueType === 'necrotico',
      adequateGranulation: tissueType === 'granulação' || tissueType === 'granulacao',
      finalEpithelialization: tissueType === 'epitelial',
    },
    modelOutputs: {
      slic,
      vlm,
    },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageName = searchParams.get('imageName');
    const mode = searchParams.get('mode');

    if (!imageName || !isPresentationMode(mode)) {
      return NextResponse.json({ error: 'imageName and valid mode are required' }, { status: 400 });
    }

    if (isDemoMode()) {
      const result = getDemoContext(imageName, mode);
      return NextResponse.json(result);
    }

    const slic = await readCsvPrediction(imageName, 'slic.csv');
    const vlm = await readCsvPrediction(imageName, 'vlm.csv');
    const context = deriveDosageContext(slic, vlm);
    const suggestion = mode === 'suggestion_review'
      ? getDosageSuggestionFromPdfRules(context)
      : null;

    return NextResponse.json({
      context: mode === 'blind' ? null : context,
      suggestion,
    });
  } catch (error) {
    console.error('Error loading dosage case context:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load case context' },
      { status: 500 }
    );
  }
}
