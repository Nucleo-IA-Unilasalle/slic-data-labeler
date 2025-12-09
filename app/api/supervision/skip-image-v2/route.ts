'use server';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface SkipImageRequest {
  username: string;
  image_name: string;
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

export async function POST(request: Request) {
  try {
    const body: SkipImageRequest = await request.json();

    if (!body.username || !body.image_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseClient();

    const { data: existingRecord, error: queryError } = await supabase
      .from('human_feedback_v2')
      .select('id')
      .eq('image_name', body.image_name)
      .eq('user', body.username)
      .single();

    if (queryError && queryError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing record: ${queryError.message}`);
    }

    if (existingRecord) {
      return NextResponse.json(
        { error: 'Image already processed by this user' },
        { status: 409 }
      );
    }

    const { error: insertError } = await supabase
      .from('human_feedback_v2')
      .insert({
        user: body.username,
        image_name: body.image_name,
        skipped: true,
        qtd_exudado: null,
        epitelial: null,
        esfacelo: null,
        granulacao: null,
        necrotic: null,
        obs: body.obs || null,
      });

    if (insertError) {
      console.error('Supabase insert error (skip v2):', insertError);
      throw new Error(`Failed to save skip record: ${insertError.message}`);
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Image skipped (v2) by ${body.username}: ${body.image_name}`);

    return NextResponse.json({
      success: true,
      message: 'Image skipped successfully (v2)',
    });
  } catch (error) {
    console.error('Error skipping image (v2):', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to skip image' },
      { status: 500 }
    );
  }
}


