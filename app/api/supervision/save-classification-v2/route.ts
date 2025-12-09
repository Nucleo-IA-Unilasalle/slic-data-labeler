'use server';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface ClassificationV2Request {
  username: string;
  image_name: string;
  qtd_exudado: 'none' | 'low' | 'medium' | 'high';
  tissue_epitelial: number;
  tissue_esfacelo: number;
  tissue_granulacao: number;
  tissue_necrotic: number;
  obs?: string | null;
}

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

function validateScore(value: number, field: string) {
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`Invalid value for ${field}: must be between 0 and 1`);
  }
}

export async function POST(request: Request) {
  try {
    const body: ClassificationV2Request = await request.json();

    if (
      !body.username
      || !body.image_name
      || !body.qtd_exudado
      || body.tissue_epitelial === undefined
      || body.tissue_esfacelo === undefined
      || body.tissue_granulacao === undefined
      || body.tissue_necrotic === undefined
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    validateScore(body.tissue_epitelial, 'tissue_epitelial');
    validateScore(body.tissue_esfacelo, 'tissue_esfacelo');
    validateScore(body.tissue_granulacao, 'tissue_granulacao');
    validateScore(body.tissue_necrotic, 'tissue_necrotic');

    const supabase = await createSupabaseClient();

    const { data: existingClassification, error: queryError } = await supabase
      .from('human_feedback_v2')
      .select('id')
      .eq('image_name', body.image_name)
      .eq('user', body.username)
      .single();

    if (queryError && queryError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing classification: ${queryError.message}`);
    }

    if (existingClassification) {
      return NextResponse.json(
        { error: 'Image already classified by this user' },
        { status: 409 }
      );
    }

    const { error: insertError } = await supabase
      .from('human_feedback_v2')
      .insert({
        user: body.username,
        image_name: body.image_name,
        qtd_exudado: body.qtd_exudado,
        epitelial: body.tissue_epitelial,
        esfacelo: body.tissue_esfacelo,
        granulacao: body.tissue_granulacao,
        necrotic: body.tissue_necrotic,
        obs: body.obs || null,
        skipped: false,
      });

    if (insertError) {
      console.error('Supabase insert error (v2):', insertError);
      throw new Error(`Failed to save classification: ${insertError.message}`);
    }

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Classification V2 saved by ${body.username}: ${body.image_name} (Exsudato: ${body.qtd_exudado}, scores: epi=${body.tissue_epitelial}, esf=${body.tissue_esfacelo}, gra=${body.tissue_granulacao}, nec=${body.tissue_necrotic})`
    );

    return NextResponse.json({
      success: true,
      message: 'Classification saved successfully (v2)',
    });
  } catch (error) {
    console.error('Error saving classification (v2):', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save classification' },
      { status: 500 }
    );
  }
}


