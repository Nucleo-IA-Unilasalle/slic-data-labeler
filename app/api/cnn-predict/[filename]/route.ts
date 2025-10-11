import { NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { constants } from 'fs';

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
    const dataFilePath = join(datasetPath, filename);
    const modelPath = join(process.cwd(), 'app', 'tissue_classification_model.pth');
    const scriptPath = join(process.cwd(), 'scripts', 'cnn_inference.py');
    
    // Setup cache directory
    const cacheDir = join(process.cwd(), 'app', 'cnn_predictions_cache');
    const cacheFilePath = join(cacheDir, filename);
    
    // Ensure cache directory exists
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    // Check if cached prediction exists
    try {
      await access(cacheFilePath, constants.F_OK);
      // Cache exists, read and return it
      const cachedContent = await readFile(cacheFilePath, 'utf-8');
      const cachedPredictions = JSON.parse(cachedContent);
      console.log(`Cache hit for ${filename}`);
      return NextResponse.json(cachedPredictions);
    } catch (error) {
      // Cache doesn't exist, continue to inference
      console.log(`Cache miss for ${filename}, running inference...`);
    }
    
    // Create temporary output file
    const outputFilePath = join(tmpdir(), `cnn_output_${Date.now()}.json`);
    
    // Run Python inference script
    const result = await new Promise<string>((resolve, reject) => {
      const pythonProcess = spawn('py', [
        scriptPath,
        modelPath,
        dataFilePath,
        outputFilePath
      ]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${stderr || stdout}`));
        } else {
          resolve(stdout);
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
    
    // Read the output file
    const outputContent = await readFile(outputFilePath, 'utf-8');
    const predictions = JSON.parse(outputContent);
    
    // Save to cache
    try {
      await writeFile(cacheFilePath, outputContent, 'utf-8');
      console.log(`Cached predictions for ${filename}`);
    } catch (error) {
      console.error('Failed to cache predictions:', error);
      // Continue anyway, caching is not critical
    }
    
    // Clean up temporary file
    await unlink(outputFilePath).catch(() => {
      // Ignore cleanup errors
    });
    
    return NextResponse.json(predictions);
  } catch (error) {
    console.error('Error running CNN inference:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run CNN inference' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    
    const cacheDir = join(process.cwd(), 'app', 'cnn_predictions_cache');
    const cacheFilePath = join(cacheDir, filename);
    
    // Try to delete the cache file
    try {
      await unlink(cacheFilePath);
      console.log(`Deleted cache for ${filename}`);
      return NextResponse.json({ success: true, message: 'Cache cleared' });
    } catch (error) {
      // Cache file doesn't exist or couldn't be deleted
      return NextResponse.json({ success: true, message: 'No cache to clear' });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear cache' },
      { status: 500 }
    );
  }
}

