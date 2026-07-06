'use server';

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  choosePresentationMode,
  countRemainingAssignments,
  getNextAssignmentSequence,
  REQUIRED_PRESENTATION_MODES,
  selectEligibleImage,
  type PriorAssignment,
} from '@/lib/dosage/assignment';
import { isDemoMode, getDemoAssignment, advanceDemoIndex } from '@/lib/dosage/demo';

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
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (isDemoMode()) {
      const result = await getDemoAssignment(username);
      if (!result.done) {
        advanceDemoIndex();
      }
      return NextResponse.json(result);
    }

    const listPath = join(process.cwd(), 'app', 'data', 'images_list.json');
    const fileContent = await readFile(listPath, 'utf-8');
    const allImages = JSON.parse(fileContent) as string[];

    const supabase = await createSupabaseClient();
    const { data, error } = await supabase
      .from('dosage_feedback')
      .select('image_name,presentation_mode,assignment_sequence,skipped')
      .eq('user', username)
      .order('assignment_sequence', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch dosage assignments: ${error.message}`);
    }

    const assignments = (data ?? []) as PriorAssignment[];
    const remainingCount = countRemainingAssignments(allImages, assignments);
    const presentationMode = choosePresentationMode(allImages, assignments);
    const assignmentSequence = getNextAssignmentSequence(assignments);
    const imageName = presentationMode === null
      ? null
      : selectEligibleImage(allImages, assignments, presentationMode);

    if (presentationMode === null || imageName === null) {
      return NextResponse.json({
        done: true,
        totalCount: allImages.length,
        totalAssignmentCount: allImages.length * REQUIRED_PRESENTATION_MODES.length,
        completedCount: assignments.filter((assignment) => !assignment.skipped).length,
        skippedCount: assignments.filter((assignment) => assignment.skipped).length,
        remainingCount: 0,
      });
    }

    return NextResponse.json({
      done: false,
      imageName,
      presentationMode,
      assignmentSequence,
      totalCount: allImages.length,
      totalAssignmentCount: allImages.length * REQUIRED_PRESENTATION_MODES.length,
      completedCount: assignments.filter((assignment) => !assignment.skipped).length,
      skippedCount: assignments.filter((assignment) => assignment.skipped).length,
      remainingCount,
    });
  } catch (error) {
    console.error('Error listing dosage cases:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list dosage cases' },
      { status: 500 }
    );
  }
}
