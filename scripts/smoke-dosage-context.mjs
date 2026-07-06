import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), '.tmp', 'dosage-context-smoke');
const tscBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const tscArgs = [
  '--outDir',
  outDir,
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--moduleResolution',
  'node',
  '--esModuleInterop',
  '--skipLibCheck',
  'lib/dosage/context.ts',
  'lib/dosage/dosage-rules.ts',
];

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

execFileSync(
  process.platform === 'win32' ? 'cmd.exe' : tscBin,
  process.platform === 'win32' ? ['/c', tscBin, ...tscArgs] : tscArgs,
  { stdio: 'inherit' }
);

const { loadDosageClassificationContext } = await import(
  `file:///${join(outDir, 'context.js').replaceAll('\\', '/')}`
);
const { getDosageSuggestionFromPdfRules } = await import(
  `file:///${join(outDir, 'dosage-rules.js').replaceAll('\\', '/')}`
);

const classified = await loadDosageClassificationContext('fusc_0002.png');
assert.equal(classified.context.modelOutputs?.available, true);
assert.equal(classified.context.modelOutputs?.sources?.slic, true);
assert.equal(classified.context.modelOutputs?.sources?.vlm, true);
assert.equal(classified.context.tissue?.dominant, 'granulação');

const unclassified = await loadDosageClassificationContext('test_other_fusc_0012.png');
assert.equal(unclassified.context.modelOutputs?.available, false);
assert.equal(unclassified.context.modelOutputs?.sources?.slic, false);
assert.equal(unclassified.context.modelOutputs?.sources?.vlm, false);

const suggestion = getDosageSuggestionFromPdfRules(unclassified.context);
assert.equal(suggestion.decisionCategory, 'not_sure');
assert.equal(suggestion.sourceRule, 'pdf_fallback_insufficient_context');

rmSync(outDir, { recursive: true, force: true });

console.log('dosage context smoke passed');
