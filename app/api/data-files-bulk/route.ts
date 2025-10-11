import { NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { join } from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filenames } = body;

    if (!Array.isArray(filenames)) {
      return NextResponse.json(
        { error: 'filenames must be an array' },
        { status: 400 }
      );
    }

    const datasetPath = join(process.cwd(), 'app', 'dataset');
    const reviewedPath = join(process.cwd(), 'app', 'dataset_reviewed');

    const results = await Promise.all(
      filenames.map(async (filename: string) => {
        try {
          // Load wound data
          const dataFilePath = join(datasetPath, filename);
          const dataContent = await readFile(dataFilePath, 'utf-8');
          const woundData = JSON.parse(dataContent);

          // Check if reviewed
          const reviewFilename = filename.replace('.json', '_reviewed.json');
          const reviewFilePath = join(reviewedPath, reviewFilename);
          let hasReview = false;
          
          try {
            await access(reviewFilePath);
            hasReview = true;
          } catch {
            hasReview = false;
          }

          return {
            filename: filename,
            woundData: woundData,
            isReviewed: hasReview,
            error: null,
          };
        } catch (error) {
          console.error(`Error loading ${filename}:`, error);
          return {
            filename: filename,
            woundData: null,
            isReviewed: false,
            error: error instanceof Error ? error.message : 'Failed to load file',
          };
        }
      })
    );

    return NextResponse.json({ results: results });
  } catch (error) {
    console.error('Error in bulk data fetch:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bulk data' },
      { status: 500 }
    );
  }
}

