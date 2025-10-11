import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    if (!filename.endsWith('.json')) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }
    
    const datasetPath = join(process.cwd(), 'app', 'dataset');
    const filePath = join(datasetPath, filename);
    
    const fileContent = await readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return NextResponse.json(
      { error: 'Failed to read data file' },
      { status: 500 }
    );
  }
}

