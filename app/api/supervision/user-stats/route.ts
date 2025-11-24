import { NextResponse } from 'next/server';
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

    // Fetch all records for the user
    const { data: records, error } = await supabase
      .from('human_feedback_tissue')
      .select('*')
      .eq('user', username);

    if (error) {
      throw error;
    }

    const totalLabels = records.length;
    const skippedCount = records.filter(r => r.skipped).length;
    const validLabels = records.filter(r => !r.skipped);

    // Calculate tissue type distribution
    const tissueTypeStats = validLabels.reduce((acc: Record<string, number>, curr) => {
      const type = curr.tissue_type || 'Unspecified';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Calculate exudate level distribution
    const exudateLevelStats = validLabels.reduce((acc: Record<string, number>, curr) => {
      const level = curr.qtd_exudado || 'Unspecified';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    // Prepare data for charts
    const tissueChartData = Object.entries(tissueTypeStats).map(([name, value]) => ({
      name,
      value,
    }));

    const exudateChartData = Object.entries(exudateLevelStats).map(([name, value]) => ({
      name,
      value,
    }));

    return NextResponse.json({
      username,
      totalLabels,
      skippedCount,
      validCount: validLabels.length,
      tissueStats: tissueChartData,
      exudateStats: exudateChartData,
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}

