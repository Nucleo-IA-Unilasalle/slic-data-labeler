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
    
    // Check if image is already processed
    const { data: existingRecord, error: queryError } = await supabase
      .from('human_feedback_tissue')
      .select('id')
      .eq('image_name', body.image_name)
      .single();
    
    if (queryError && queryError.code !== 'PGRST116') {
      // PGRST116 is "no rows" error, which is expected
      throw new Error(`Failed to check existing record: ${queryError.message}`);
    }
    
    if (existingRecord) {
      return NextResponse.json(
        { error: 'Image already processed' },
        { status: 409 }
      );
    }
    
    // Insert skip record into Supabase with skipped=true and other fields null
    const { error: insertError } = await supabase
      .from('human_feedback_tissue')
      .insert({
        user: body.username,
        image_name: body.image_name,
        skipped: true,
        qtd_exudado: null,
        tissue_type: null,
        obs: body.obs || null,
      });
    
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error(`Failed to save skip record: ${insertError.message}`);
    }
    
    // Log the skip with username
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Image skipped by ${body.username}: ${body.image_name}`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Image skipped successfully'
    });
  } catch (error) {
    console.error('Error skipping image:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to skip image' },
      { status: 500 }
    );
  }
}
