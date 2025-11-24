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

function escapeCsvField(field: string | number | boolean | null | undefined): string {
  if (field === null || field === undefined) {
    return '';
  }
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

export async function GET() {
  try {
    const supabase = await createSupabaseClient();

    // Fetch all records from the table with pagination
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = (page + 1) * pageSize - 1;

      const { data: records, error } = await supabase
        .from('human_feedback_tissue')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      if (records && records.length > 0) {
        allRecords = [...allRecords, ...(records as Record<string, unknown>[])];
        // If we got fewer records than pageSize, we've reached the end
        if (records.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
      
      page++;
    }

    // Define CSV headers
    const headers = [
      'id',
      'created_at',
      'user',
      'image_name',
      'qtd_exudado',
      'tissue_type',
      'obs',
      'skipped'
    ];

    // Generate CSV content
    const csvRows = [headers.join(',')];

    allRecords.forEach((record) => {
      const row = headers.map((header) => escapeCsvField(record[header] as string | number | boolean | null | undefined));
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    // Create response with CSV content and headers
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="human_feedback_tissue_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Error generating CSV:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate CSV' },
      { status: 500 }
    );
  }
}

