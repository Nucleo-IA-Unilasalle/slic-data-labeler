import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DosageContext } from './types';

export interface PredictionRow {
  image_name: string;
  qtd_exudado?: string;
  tissue_type?: string;
}

interface DatasetImageAvailability {
  assignmentList: boolean;
}

interface ClassificationContextInput {
  requestedImageName: string;
  slic: PredictionRow | null;
  vlm: PredictionRow | null;
  imageAvailability: DatasetImageAvailability;
  matchedImageName?: string;
}

export interface DosageClassificationResult {
  context: DosageContext;
  slic: PredictionRow | null;
  vlm: PredictionRow | null;
}

function normalizeTissueType(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function isGranulation(value: string | undefined): boolean {
  return value === 'granulação' || value === 'granulacao';
}

function isNecrotic(value: string | undefined): boolean {
  return value === 'necrótico' || value === 'necrotico' || value === 'necrotic';
}

function isEpithelial(value: string | undefined): boolean {
  return value === 'epitelial';
}

function isSlough(value: string | undefined): boolean {
  return value === 'esfacelo';
}

function stripKnownDatasetPrefixes(imageName: string): string {
  return imageName
    .replace(/^test_other_/, '')
    .replace(/^train_wsnet_/, '')
    .replace(/^train_fusc_/, '')
    .replace(/^train_medetec_/, '');
}

export function candidateImageNames(imageName: string): string[] {
  const stripped = stripKnownDatasetPrefixes(imageName);
  const parts = imageName.split('_');
  const suffixName = parts.length >= 3 ? parts.slice(2).join('_') : imageName;

  return Array.from(new Set([imageName, stripped, suffixName]));
}

export function parsePredictionCsv(content: string): PredictionRow[] {
  const [headerLine, ...lines] = content.trim().split(/\r?\n/);
  if (!headerLine) return [];

  const headers = headerLine.split(',').map((header) => header.trim());

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const values = line.split(',');
      const parsedRow = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));

      return {
        image_name: parsedRow.image_name ?? values[0]?.trim() ?? '',
        qtd_exudado: parsedRow.qtd_exudado,
        tissue_type: parsedRow.tissue_type,
      };
    });
}

export function findPredictionForImage(rows: PredictionRow[], imageName: string): PredictionRow | null {
  const candidates = new Set(candidateImageNames(imageName));
  return rows.find((row) => candidates.has(row.image_name)) ?? null;
}

async function readPredictionRows(filename: string): Promise<PredictionRow[]> {
  try {
    const csvPath = join(process.cwd(), 'app', 'api', 'supervision', filename);
    const content = await readFile(csvPath, 'utf-8');
    return parsePredictionCsv(content);
  } catch {
    return [];
  }
}

async function readAssignmentImageNames(): Promise<string[]> {
  try {
    const listPath = join(process.cwd(), 'app', 'data', 'images_list.json');
    const fileContent = await readFile(listPath, 'utf-8');
    return JSON.parse(fileContent) as string[];
  } catch {
    return [];
  }
}

async function getImageAvailability(imageName: string): Promise<DatasetImageAvailability> {
  const assignmentImages = await readAssignmentImageNames();
  const candidates = candidateImageNames(imageName);

  return {
    assignmentList: candidates.some((candidate) => assignmentImages.includes(candidate)),
  };
}

export function deriveDosageContext(input: ClassificationContextInput): DosageContext {
  const { requestedImageName, slic, vlm, imageAvailability, matchedImageName } = input;
  const primary = slic ?? vlm;
  const tissueType = normalizeTissueType(primary?.tissue_type);
  const exudateAmount = primary?.qtd_exudado;
  const classificationAvailable = slic !== null || vlm !== null;

  return {
    tissue: {
      epithelial: isEpithelial(tissueType) ? 1 : 0,
      slough: isSlough(tissueType) ? 1 : 0,
      granulation: isGranulation(tissueType) ? 1 : 0,
      necrotic: isNecrotic(tissueType) ? 1 : 0,
      dominant: tissueType,
    },
    exudate: {
      amount: exudateAmount,
    },
    flags: {
      extensiveNecrosis: isNecrotic(tissueType),
      adequateGranulation: isGranulation(tissueType),
      finalEpithelialization: isEpithelial(tissueType),
    },
    modelOutputs: {
      available: classificationAvailable,
      requestedImageName,
      matchedImageName,
      candidateImageNames: candidateImageNames(requestedImageName),
      sources: {
        slic: slic !== null,
        vlm: vlm !== null,
      },
      imageAvailability,
      slic,
      vlm,
    },
  };
}

export async function loadDosageClassificationContext(imageName: string): Promise<DosageClassificationResult> {
  const [slicRows, vlmRows, imageAvailability] = await Promise.all([
    readPredictionRows('slic.csv'),
    readPredictionRows('vlm.csv'),
    getImageAvailability(imageName),
  ]);

  const slic = findPredictionForImage(slicRows, imageName);
  const vlm = findPredictionForImage(vlmRows, imageName);
  const matchedImageName = slic?.image_name ?? vlm?.image_name;
  const context = deriveDosageContext({
    requestedImageName: imageName,
    slic,
    vlm,
    imageAvailability,
    matchedImageName,
  });

  return {
    context,
    slic,
    vlm,
  };
}
