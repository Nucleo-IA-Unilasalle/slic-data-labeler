import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

interface Params {
  filename: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const { filename } = await params;
    
    const reviewFilename = filename.replace('.json', '').replace('data_', '') + '_reviewed.json';
    const reviewPath = join(process.cwd(), 'app', 'dataset_reviewed', reviewFilename);
    
    const hasReview = existsSync(reviewPath);
    
    return NextResponse.json({ 
      hasReview: hasReview,
      reviewFilename: reviewFilename
    });
  } catch (error) {
    console.error('Error checking review:', error);
    return NextResponse.json(
      { error: 'Failed to check review' },
      { status: 500 }
    );
  }
}



