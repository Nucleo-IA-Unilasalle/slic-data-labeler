'use server';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { DosageFeedbackPayload } from '@/lib/dosage/types';
import { isDemoMode } from '@/lib/dosage/demo';

async function createSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DosageFeedbackPayload;

    if (!body.username || !body.image_name || !body.presentation_mode || !body.assignment_sequence) {
      return NextResponse.json({ error: 'Missing assignment fields' }, { status: 400 });
    }

    if (!body.decision_category || !body.dose_range || !body.wavelength) {
      return NextResponse.json({ error: 'Missing dosage labels' }, { status: 400 });
    }

    const isEligible = !['block_pbm', 'postpone', 'not_sure'].includes(body.decision_category);
    if (isEligible && (body.dose_range === 'custom' || body.dose_range === 'by_area') && !body.custom_dose?.trim()) {
      return NextResponse.json({ error: 'custom_dose is required for personalized or area-based dose range' }, { status: 400 });
    }

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true });
    }

    const supabase = await createSupabaseClient();
    const { data: existingFeedback, error: queryError } = await supabase
      .from('dosage_feedback')
      .select('id')
      .eq('user', body.username)
      .eq('image_name', body.image_name)
      .eq('presentation_mode', body.presentation_mode)
      .single();

    if (queryError && queryError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing dosage feedback: ${queryError.message}`);
    }

    if (existingFeedback) {
      return NextResponse.json({ error: 'Case already processed for this user and mode' }, { status: 409 });
    }

    const { error } = await supabase.from('dosage_feedback').insert({
      user: body.username,
      image_name: body.image_name,
      presentation_mode: body.presentation_mode,
      assignment_sequence: body.assignment_sequence,
      decision_category: body.decision_category,
      dose_range: body.dose_range,
      custom_dose: body.custom_dose || null,
      wavelength: body.wavelength,
      accepted_suggestion: body.accepted_suggestion ?? null,
      edited_fields: body.edited_fields ?? null,
      shown_context: body.shown_context ?? null,
      shown_suggestion: body.shown_suggestion ?? null,
      dosage_obs: body.dosage_obs || null,
      skipped: false,
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Duplicate assignment detected' }, { status: 409 });
      }

      throw new Error(`Failed to save dosage feedback: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving dosage label:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save dosage label' },
      { status: 500 }
    );
  }
}
