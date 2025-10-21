import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface TissueStatistics {
  necrosis: number;
  slough: number;
  red_tissue: number;
}

interface FileWithStats {
  filename: string;
  percentages: TissueStatistics;
}

// In-memory cache for sorted results
const sortCache: {
  [key: string]: {
    files: string[];
    stats: FileWithStats[];
    timestamp: number;
  };
} = {};

const CACHE_DURATION = 60000; // 1 minute cache

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'none';
    
    const datasetPath = join(process.cwd(), 'app', 'dataset');
    const files = await readdir(datasetPath);
    
    const jsonFiles = files
      .filter((file) => file.endsWith('.json'))
      .sort();
    
    // If no sorting requested, return files as-is
    if (sortBy === 'none') {
      return NextResponse.json({ files: jsonFiles, sortBy: 'none' });
    }
    
    // Check cache
    const cacheKey = sortBy;
    const now = Date.now();
    if (sortCache[cacheKey] && (now - sortCache[cacheKey].timestamp) < CACHE_DURATION) {
      console.log(`Cache hit for sort: ${sortBy}`);
      return NextResponse.json({ 
        files: sortCache[cacheKey].files, 
        sortBy,
        stats: sortCache[cacheKey].stats,
        cached: true
      });
    }
    
    console.log(`Cache miss for sort: ${sortBy}, loading files...`);
    
    // Load tissue statistics for all files
    const filesWithStats: FileWithStats[] = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = join(datasetPath, file);
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        if (data.tissue_statistics && data.tissue_statistics.percentages) {
          filesWithStats.push({
            filename: file,
            percentages: data.tissue_statistics.percentages
          });
        }
      } catch (error) {
        console.error(`Error reading ${file}:`, error);
        // Skip files that can't be read
      }
    }
    
    // Sort based on requested criteria
    if (sortBy === 'necrosis') {
      filesWithStats.sort((a, b) => b.percentages.necrosis - a.percentages.necrosis);
    } else if (sortBy === 'slough') {
      filesWithStats.sort((a, b) => b.percentages.slough - a.percentages.slough);
    } else if (sortBy === 'red_tissue') {
      filesWithStats.sort((a, b) => b.percentages.red_tissue - a.percentages.red_tissue);
    }
    
    const sortedFiles = filesWithStats.map((f) => f.filename);
    
    // Store in cache
    sortCache[cacheKey] = {
      files: sortedFiles,
      stats: filesWithStats,
      timestamp: now
    };
    
    return NextResponse.json({ 
      files: sortedFiles, 
      sortBy,
      stats: filesWithStats,
      cached: false
    });
  } catch (error) {
    console.error('Error reading data files:', error);
    return NextResponse.json(
      { error: 'Failed to read data files' },
      { status: 500 }
    );
  }
}

