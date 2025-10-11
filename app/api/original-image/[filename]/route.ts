import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    if (!filename.endsWith('.png')) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }
    
    const imagePath = join(process.cwd(), 'app', 'train_images', filename);
    const fileBuffer = await readFile(imagePath);
    const base64 = fileBuffer.toString('base64');
    
    return NextResponse.json({ 
      base64: `data:image/png;base64,${base64}`,
      filename: filename
    });
  } catch (error) {
    console.error('Error reading original image:', error);
    return NextResponse.json(
      { error: 'Failed to read original image' },
      { status: 500 }
    );
  }
}

