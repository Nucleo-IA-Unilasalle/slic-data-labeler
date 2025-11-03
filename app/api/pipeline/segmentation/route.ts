import { NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { constants } from 'fs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imagePath } = body;
    
    if (!imagePath) {
      return NextResponse.json(
        { error: 'Missing imagePath in request body' },
        { status: 400 }
      );
    }
    
    const modelPath = join(process.cwd(), 'scripts', 'pretrained_best_efficientnet_b4_unet_model.pth');
    const scriptPath = join(process.cwd(), 'scripts', 'segmentation_inference.py');
    
    // Setup cache directory
    const cacheDir = join(process.cwd(), 'app', 'segmentation_cache');
    const imageBasename = imagePath.split(/[/\\]/).pop() || 'unknown';
    const cacheFilePath = join(cacheDir, `${imageBasename}.json`);
    
    // Ensure cache directory exists
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch {
      // Directory might already exist, ignore error
    }
    
    // Check if cached prediction exists
    try {
      await access(cacheFilePath, constants.F_OK);
      // Cache exists, read and return it
      const cachedContent = await readFile(cacheFilePath, 'utf-8');
      const cachedSegmentation = JSON.parse(cachedContent);
      console.log(`Cache hit for ${imageBasename}`);
      return NextResponse.json(cachedSegmentation);
    } catch {
      // Cache doesn't exist, continue to inference
      console.log(`Cache miss for ${imageBasename}, running inference...`);
    }
    
    // Create temporary output file
    const outputFilePath = join(tmpdir(), `segmentation_output_${Date.now()}.json`);
    
    // Resolve the full image path
    const fullImagePath = join(process.cwd(), imagePath);
    
    // Run Python inference script
    await new Promise<string>((resolve, reject) => {
      const pythonProcess = spawn('py', [
        scriptPath,
        modelPath,
        fullImagePath,
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
    const segmentation = JSON.parse(outputContent);
    
    // Save to cache
    try {
      await writeFile(cacheFilePath, outputContent, 'utf-8');
      console.log(`Cached segmentation for ${imageBasename}`);
    } catch {
      console.error('Failed to cache segmentation:', new Error('Could not write cache'));
      // Continue anyway, caching is not critical
    }
    
    // Clean up temporary file
    await unlink(outputFilePath).catch(() => {
      // Ignore cleanup errors
    });
    
    return NextResponse.json(segmentation);
  } catch (error) {
    console.error('Error running segmentation inference:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run segmentation inference' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { imagePath } = body;
    
    if (!imagePath) {
      return NextResponse.json(
        { error: 'Missing imagePath in request body' },
        { status: 400 }
      );
    }
    
    const cacheDir = join(process.cwd(), 'app', 'segmentation_cache');
    const imageBasename = imagePath.split(/[/\\]/).pop() || 'unknown';
    const cacheFilePath = join(cacheDir, `${imageBasename}.json`);
    
    // Try to delete the cache file
    try {
      await unlink(cacheFilePath);
      console.log(`Deleted cache for ${imageBasename}`);
      return NextResponse.json({ success: true, message: 'Cache cleared' });
    } catch {
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

