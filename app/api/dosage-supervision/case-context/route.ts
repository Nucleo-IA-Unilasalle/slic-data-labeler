import { NextResponse } from 'next/server';
import { loadDosageClassificationContext } from '@/lib/dosage/context';
import { getDosageSuggestionFromPdfRules } from '@/lib/dosage/dosage-rules';
import type { PresentationMode } from '@/lib/dosage/types';
import { isDemoMode, getDemoContext } from '@/lib/dosage/demo';

function isPresentationMode(value: string | null): value is PresentationMode {
  return value === 'blind' || value === 'context' || value === 'suggestion_review';
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

    const { context } = await loadDosageClassificationContext(imageName);
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
