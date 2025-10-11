import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface ClusterReview {
  cluster_id: number;
  scores: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
}

interface ReviewData {
  image_filename: string;
  reviewed_clusters: ClusterReview[];
}

export async function POST(request: Request) {
  try {
    const body: ReviewData = await request.json();
    
    const reviewedDir = join(process.cwd(), 'app', 'dataset_reviewed');
    
    if (!existsSync(reviewedDir)) {
      await mkdir(reviewedDir, { recursive: true });
    }
    
    const filename = body.image_filename.replace('.png', '_reviewed.json');
    const filePath = join(reviewedDir, filename);
    
    await writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      message: 'Review saved successfully',
      filename: filename
    });
  } catch (error) {
    console.error('Error saving review:', error);
    return NextResponse.json(
      { error: 'Failed to save review' },
      { status: 500 }
    );
  }
}

