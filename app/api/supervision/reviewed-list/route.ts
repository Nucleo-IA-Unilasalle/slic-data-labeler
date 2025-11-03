import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface HumanFeedbackRow {
  id: string;
  created_at: string;
  user: string;
  image_name: string;
  qtd_exudado: string;
  tissue_type: string;
  obs: string;
  skipped: string;
}

function parseCSV(content: string): HumanFeedbackRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const rows: HumanFeedbackRow[] = [];
  let currentRow = '';
  let insideQuotes = false;
  
  // First, reconstruct lines that were split by newlines within quoted fields
  const reconstructedLines: string[] = [];
  
  for (const line of lines) {
    if (currentRow === '') {
      currentRow = line;
    } else {
      currentRow += '\n' + line;
    }
    
    // Count quotes to determine if we're inside a quoted field
    const quoteCount = (currentRow.match(/"/g) || []).length;
    insideQuotes = quoteCount % 2 !== 0;
    
    // If we're not inside quotes, we've completed a row
    if (!insideQuotes) {
      reconstructedLines.push(currentRow);
      currentRow = '';
    }
  }
  
  // If there's a remaining row, add it
  if (currentRow !== '') {
    reconstructedLines.push(currentRow);
  }
  
  // Parse the reconstructed lines
  for (let i = 1; i < reconstructedLines.length; i++) {
    const line = reconstructedLines[i];
    if (!line.trim()) continue;
    
    // Handle CSV parsing with potential commas in quoted fields (like obs field)
    const values: string[] = [];
    let currentValue = '';
    insideQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
        // Don't add the quote to the value
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim()); // Add the last value
    
    if (values.length >= 8) {
      rows.push({
        id: values[0] || '',
        created_at: values[1] || '',
        user: values[2] || '',
        image_name: values[3] || '',
        qtd_exudado: values[4] || '',
        tissue_type: values[5] || '',
        obs: values[6] || '',
        skipped: values[7] || '',
      });
    }
  }
  
  return rows.filter((row: HumanFeedbackRow) => row.skipped === 'false' && row.image_name);
}

export async function GET() {
  try {
    const csvPath = path.join(process.cwd(), 'app', 'api', 'supervision', 'human_feedback_tissue_rows.csv');
    const content = await fs.readFile(csvPath, 'utf-8');
    const csvData = parseCSV(content);
    
    const reviewedData = csvData.map((row: HumanFeedbackRow) => {
      // Create a mock cluster structure for compatibility with frontend
      // The frontend uses clusters to determine dominant tissue and exudate level
      // We'll map the CSV values to cluster-like structure
      const normalizedTissueType = row.tissue_type.toLowerCase().trim();
      
      let necrosis = 0;
      let slough = 0;
      let redTissue = 0;
      
      if (normalizedTissueType === 'necrotic' || normalizedTissueType === 'necrotico') {
        necrosis = 0.7;
      } else if (normalizedTissueType === 'esfacelo') {
        slough = 0.7;
      } else if (normalizedTissueType === 'granulação') {
        redTissue = 0.7;
      } else if (normalizedTissueType === 'epitelial') {
        redTissue = 0.5; // Epithelial is healthy tissue, similar to granulation
      }
      
      const mockCluster = {
        cluster_id: 0,
        scores: {
          necrosis: necrosis,
          slough: slough,
          red_tissue: redTissue,
        },
      };
      
      return {
        filename: `${row.image_name.replace('.png', '')}_reviewed.json`,
        image_filename: row.image_name,
        clusters_count: 1,
        reviewed_clusters: [mockCluster],
        user: row.user,
        qtd_exudado: row.qtd_exudado,
        tissue_type: row.tissue_type,
        obs: row.obs,
        created_at: row.created_at,
      };
    });
    
    return NextResponse.json(reviewedData);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load reviewed data', details: errorMessage },
      { status: 500 }
    );
  }
}

