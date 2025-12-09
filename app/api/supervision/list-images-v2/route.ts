'use server';

import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseClient();

    const { data: classifiedData, error: classifiedError } = await supabase
      .from('human_feedback_v2')
      .select('image_name')
      .eq('user', username);

    if (classifiedError) {
      throw new Error(`Failed to fetch classified images: ${classifiedError.message}`);
    }

    const classifiedImages = new Set(
      classifiedData
        ?.map((record: { image_name: string | null }) => record.image_name)
        .filter((value): value is string => Boolean(value)) ?? []
    );

    const datasetDir = join(process.cwd(), 'public', 'dataset_all');
    const allEntries = await readdir(datasetDir, { withFileTypes: true });
    const allFiles = allEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map((entry) => entry.name);

    const priority = (name: string) => {
      if (name.startsWith('train_wsnet')) return 0;
      if (name.startsWith('train_medetec')) return 1;
      return 2;
    };

    const imagesToShow = allFiles;

    const unclassifiedImages = imagesToShow
      .filter((image) => !classifiedImages.has(image))
      .sort((a, b) => priority(a) - priority(b));

    return NextResponse.json({
      unclassifiedImages,
      totalCount: imagesToShow.length,
      unclassifiedCount: unclassifiedImages.length,
      classifiedCount: classifiedImages.size,
    });
  } catch (error) {
    console.error('Error reading images (v2):', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read images' },
      { status: 500 }
    );
  }
}


