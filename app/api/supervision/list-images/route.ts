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
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore errors from Server Components
          }
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
    
    // Get classified images from Supabase for this specific user
    const { data: classifiedData, error: classifiedError } = await supabase
      .from('human_feedback_tissue')
      .select('image_name')
      .eq('user', username);
    
    if (classifiedError) {
      throw new Error(`Failed to fetch classified images: ${classifiedError.message}`);
    }
    
    const classifiedImages = new Set(
      classifiedData?.map((record: { image_name: string | null }) => record.image_name).filter(Boolean) || []
    );
    
    // Read all images from images_fuseg directory
    const imagesDirPath = join(process.cwd(), 'app', 'images_fuseg');
    const allFiles = await readdir(imagesDirPath);
    
    // Filter only PNG files
    const imagesToShow = new Set(
      allFiles.filter((file) => file.endsWith('.png'))
    );
    
    // Filter to only unclassified images that should be shown (not classified by this user)
    const unclassifiedImages: string[] = [];
    
    for (const image of imagesToShow) {
      if (!classifiedImages.has(image)) {
        unclassifiedImages.push(image);
      }
    }
    
    return NextResponse.json({ 
      unclassifiedImages: unclassifiedImages,
      totalCount: imagesToShow.size,
      unclassifiedCount: unclassifiedImages.length,
      classifiedCount: classifiedImages.size
    });
  } catch (error) {
    console.error('Error reading images:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read images' },
      { status: 500 }
    );
  }
}

