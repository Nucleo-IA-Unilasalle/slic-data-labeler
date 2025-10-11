import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const datasetPath = join(process.cwd(), 'app', 'dataset');
    const files = await readdir(datasetPath);
    
    const jsonFiles = files
      .filter((file) => file.endsWith('.json'))
      .sort();
    
    return NextResponse.json({ files: jsonFiles });
  } catch (error) {
    console.error('Error reading data files:', error);
    return NextResponse.json(
      { error: 'Failed to read data files' },
      { status: 500 }
    );
  }
}

