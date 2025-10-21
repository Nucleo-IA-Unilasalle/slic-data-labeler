import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface ClassificationRequest {
  username: string;
  image_name: string;
  qtd_exudado: 'none' | 'low' | 'medium' | 'high';
  tissue_type: 'granulação' | 'esfacelo' | 'necrotic' | 'epitelial';
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
    const body: ClassificationRequest = await request.json();
    
    if (!body.username || !body.image_name || !body.qtd_exudado || !body.tissue_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const supabase = await createSupabaseClient();
    
    // Check if image is already classified
    const { data: existingClassification, error: queryError } = await supabase
      .from('human_feedback_tissue')
      .select('id')
      .eq('image_name', body.image_name)
      .single();
    
    if (queryError && queryError.code !== 'PGRST116') {
      // PGRST116 is "no rows" error, which is expected
      throw new Error(`Failed to check existing classification: ${queryError.message}`);
    }
    
    if (existingClassification) {
      return NextResponse.json(
        { error: 'Image already classified' },
        { status: 409 }
      );
    }
    
    // Insert into Supabase
    const { error: insertError } = await supabase
      .from('human_feedback_tissue')
      .insert({
        user: body.username,
        image_name: body.image_name,
        qtd_exudado: body.qtd_exudado,
        tissue_type: body.tissue_type,
      });
    
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error(`Failed to save classification: ${insertError.message}`);
    }
    
    // Log the classification with username
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Classification saved by ${body.username}: ${body.image_name} (exudato: ${body.qtd_exudado}, tissue: ${body.tissue_type})`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Classification saved successfully'
    });
  } catch (error) {
    console.error('Error saving classification:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save classification' },
      { status: 500 }
    );
  }
}

