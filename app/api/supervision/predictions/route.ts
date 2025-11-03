import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface PredictionData {
  image_name: string;
  qtd_exudado: string;
  tissue_type: string;
}

interface CSVPredictions {
  slic: PredictionData | null;
  vlm: PredictionData | null;
}

function parseCSV(content: string): PredictionData[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map((line: string) => {
    const values = line.split(',');
    return {
      image_name: values[0],
      qtd_exudado: values[1],
      tissue_type: values[2],
    };
  }).filter((row: PredictionData) => row.image_name);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageName = searchParams.get('imageName');
    
    if (!imageName) {
      return NextResponse.json(
        { error: 'imageName parameter is required' },
        { status: 400 }
      );
    }
    
    const supervisionDir = path.join(process.cwd(), 'app', 'api', 'supervision');
    
    const slicPath = path.join(supervisionDir, 'slic.csv');
    const vlmPath = path.join(supervisionDir, 'vlm.csv');
    
    const slicContent = await fs.readFile(slicPath, 'utf-8');
    const vlmContent = await fs.readFile(vlmPath, 'utf-8');
    
    const slicData = parseCSV(slicContent);
    const vlmData = parseCSV(vlmContent);
    
    const slicPrediction = slicData.find((row: PredictionData) => row.image_name === imageName) || null;
    const vlmPrediction = vlmData.find((row: PredictionData) => row.image_name === imageName) || null;
    
    const predictions: CSVPredictions = {
      slic: slicPrediction,
      vlm: vlmPrediction,
    };
    
    return NextResponse.json(predictions);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load predictions', details: errorMessage },
      { status: 500 }
    );
  }
}

