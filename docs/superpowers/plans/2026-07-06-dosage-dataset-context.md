# Dosage Dataset Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dosage supervision use the full assigned image dataset while enriching each case with existing classification rows when available and returning production-safe fallback metadata when unavailable.

**Architecture:** Move classification CSV parsing and image-name normalization out of the API route into `lib/dosage/context.ts`. The API route will call this adapter, then generate suggestions only from the resulting production context. A Node smoke test will exercise one classified case and one unclassified full-dataset case.

**Tech Stack:** Next.js App Router, TypeScript, Node built-in test runner, Supabase-backed API routes.

---

### Task 1: Dataset Context Adapter

**Files:**
- Create: `lib/dosage/context.ts`
- Modify: `lib/dosage/types.ts`
- Modify: `app/api/dosage-supervision/case-context/route.ts`
- Test: `scripts/smoke-dosage-context.mjs`

- [ ] **Step 1: Write the failing smoke test**

Create `scripts/smoke-dosage-context.mjs` that imports the future compiled adapter from `lib/dosage/context.ts` through a temporary TypeScript compilation and asserts:

```js
assert.equal(classified.context.modelOutputs.available, true);
assert.ok(classified.context.tissue.dominant);
assert.equal(unclassified.context.modelOutputs.available, false);
assert.equal(suggestion.decisionCategory, 'not_sure');
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `node scripts/smoke-dosage-context.mjs`
Expected: FAIL because `lib/dosage/context.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/dosage/context.ts`**

Add reusable functions:

```ts
export function candidateImageNames(imageName: string): string[]
export function parsePredictionCsv(content: string): PredictionRow[]
export function findPredictionForImage(rows: PredictionRow[], imageName: string): PredictionRow | null
export function deriveDosageContext(input: ClassificationContextInput): DosageContext
export async function loadDosageClassificationContext(imageName: string): Promise<DosageClassificationResult>
```

The adapter keeps all images valid, records whether SLIC/VLM classifications are available, and returns conservative metadata when not.

- [ ] **Step 4: Wire the API route**

Replace inline CSV parsing in `app/api/dosage-supervision/case-context/route.ts` with `loadDosageClassificationContext(imageName)`. Return `context: null` for blind mode, but still compute the non-blind context and suggestion for `context` and `suggestion_review`.

- [ ] **Step 5: Run smoke test to verify it passes**

Run: `node scripts/smoke-dosage-context.mjs`
Expected: PASS for classified and unclassified cases.

### Task 2: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Add script**

Add `"smoke:dosage-context": "node scripts/smoke-dosage-context.mjs"` to `package.json`.

- [ ] **Step 2: Update README**

Document that dosage supervision assigns from the full image list and enriches context from `slic.csv` / `vlm.csv` when rows exist.

- [ ] **Step 3: Run verification**

Run:

```bash
npm run smoke:dosage-context
npm run lint
npm run build
```

Expected: all commands exit 0; lint may retain existing warnings.
