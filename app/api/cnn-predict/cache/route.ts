import { NextResponse } from 'next/server';
import { join } from 'path';
import { readdir, unlink } from 'fs/promises';

export async function DELETE() {
  try {
    const cacheDir = join(process.cwd(), 'app', 'cnn_predictions_cache');
    
    // Try to read cache directory
    let files: string[];
    try {
      files = await readdir(cacheDir);
    } catch (error) {
      // Directory doesn't exist, nothing to clear
      return NextResponse.json({ 
        success: true, 
        message: 'No cache to clear',
        filesDeleted: 0 
      });
    }
    
    // Delete all JSON files in cache directory
    const deletePromises = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => unlink(join(cacheDir, file)));
    
    await Promise.all(deletePromises);
    
    console.log(`Cleared ${deletePromises.length} cached predictions`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Cleared ${deletePromises.length} cached predictions`,
      filesDeleted: deletePromises.length
    });
  } catch (error) {
    console.error('Error clearing all cache:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear cache' },
      { status: 500 }
    );
  }
}


