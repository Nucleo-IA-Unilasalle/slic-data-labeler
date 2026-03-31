# Nail Segmentation & Size Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add nail segmentation and size comparison to the pipeline-demo page, displaying wound size in cm² when a nail reference is detected.

**Architecture:** Replace `/segmentation` call with `/size-measurement` call. On success, display both wound (blue) and nail (green) masks with size measurements. On nail detection failure, fallback to `/segmentation` and show warning.

**Tech Stack:** Next.js, React, TypeScript, Canvas API for mask rendering

---

## Task 1: Add TypeScript Interface for Size Measurement

**Files:**
- Modify: `app/pipeline-demo/page.tsx:7-14`

**Step 1: Add the SizeMeasurementResult interface after existing interfaces**

Add after line 30 (after `SurgwoundModalityResult` interface):

```typescript
interface SizeMeasurementResult {
  dfu_area_cm2: number;
  dfu_area_mm2: number;
  nail_area_mm2: number;
  px_per_mm: number;
  nail_detected: boolean;
  dfu_detected: boolean;
  calibration_source: 'user_provided' | 'population_average';
  dfu_dimensions: {
    length_mm: number;
    width_mm: number;
  };
  nail_dimensions: {
    length_mm: number;
    width_mm: number;
  };
  nail_mask: number[][];
  dfu_mask: number[][];
  original_width: number;
  original_height: number;
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors related to the new interface

**Step 3: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: add SizeMeasurementResult interface for size comparison API"
```

---

## Task 2: Add New State Variables

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Add new state variables after existing state declarations (around line 191)**

Add after `const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);`:

```typescript
const [sizeMeasurement, setSizeMeasurement] = useState<SizeMeasurementResult | null>(null);
const [combinedMaskImageUrl, setCombinedMaskImageUrl] = useState<string | null>(null);
const [nailWarning, setNailWarning] = useState<string | null>(null);
```

**Step 2: Update clearResults function to clear new state**

Find the `clearResults` function and add the new state resets:

```typescript
const clearResults = () => {
  setSegmentation(null);
  setTissueResult(null);
  setDeepskinResult(null);
  setDeepskinWarning(null);
  setSurgwoundExudate(null);
  setSurgwoundHealing(null);
  setSurgwoundInfection(null);
  setSurgwoundWarning(null);
  setMaskImageUrl(null);
  setSelectedFile(null);
  setPreviewUrl(null);
  // New state resets
  setSizeMeasurement(null);
  setCombinedMaskImageUrl(null);
  setNailWarning(null);
};
```

**Step 3: Update handleFileChange to clear new state**

Find `handleFileChange` and add resets after existing ones:

```typescript
setSizeMeasurement(null);
setCombinedMaskImageUrl(null);
setNailWarning(null);
```

**Step 4: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: add state variables for size measurement and nail detection"
```

---

## Task 3: Create Combined Mask Image Function

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Add createCombinedMaskImage function after existing createMaskImage function (around line 379)**

```typescript
const createCombinedMaskImage = (
  dfuMask: number[][],
  nailMask: number[][] | null,
  width: number,
  height: number
) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  const imageData = ctx.createImageData(width, height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dfuValue = dfuMask[y]?.[x] ?? 0;
      const nailValue = nailMask ? (nailMask[y]?.[x] ?? 0) : 0;
      
      if (dfuValue > 0) {
        // Wound: Blue
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 180;
      } else if (nailValue > 0) {
        // Nail: Green
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 255;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 180;
      } else {
        // Transparent
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 0;
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  setCombinedMaskImageUrl(canvas.toDataURL());
};
```

**Step 2: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: add createCombinedMaskImage function for dual mask overlay"
```

---

## Task 4: Modify API Call Logic - Replace Segmentation with Size Measurement

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Modify handleUploadAndPredict function**

Replace the segmentation API call section (starting around line 409) with the new size-measurement logic:

Find this section:
```typescript
// Step 2: Run segmentation
setLoadingStep('Executando segmentação da ferida...');
const segmentationResponse = await fetch(`${apiUrl}/segmentation`, {
```

Replace the entire segmentation block with:

```typescript
// Step 2: Run size measurement (includes segmentation + nail detection)
setLoadingStep('Analisando imagem e detectando unha...');
setSizeMeasurement(null);
setCombinedMaskImageUrl(null);
setNailWarning(null);

let sizeMeasurementData: SizeMeasurementResult | null = null;
let segmentationData: SegmentationResult | null = null;

try {
  const sizeMeasurementResponse = await fetch(`${apiUrl}/size-measurement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: base64Image, include_masks: true }),
  });

  if (sizeMeasurementResponse.ok) {
    sizeMeasurementData = await sizeMeasurementResponse.json();
    setSizeMeasurement(sizeMeasurementData);
    
    if (sizeMeasurementData && sizeMeasurementData.dfu_mask) {
      // Create combined mask with both wound and nail
      createCombinedMaskImage(
        sizeMeasurementData.dfu_mask,
        sizeMeasurementData.nail_mask,
        sizeMeasurementData.original_width,
        sizeMeasurementData.original_height
      );
      
      // Also set segmentation for backward compatibility with tissue classification
      segmentationData = {
        mask: sizeMeasurementData.dfu_mask,
        original_width: sizeMeasurementData.original_width,
        original_height: sizeMeasurementData.original_height,
        wound_pixels: 0, // Will be calculated from mask if needed
        total_pixels: sizeMeasurementData.original_width * sizeMeasurementData.original_height,
        wound_percentage: sizeMeasurementData.dfu_detected ? 
          (sizeMeasurementData.dfu_area_mm2 / (sizeMeasurementData.original_width * sizeMeasurementData.original_height / (sizeMeasurementData.px_per_mm * sizeMeasurementData.px_per_mm))) * 100 : 0,
      };
      setSegmentation(segmentationData);
    }
  } else {
    // Size measurement failed (likely no nail detected), fallback to segmentation
    const errorData = await sizeMeasurementResponse.json().catch(() => ({}));
    console.log('Size measurement response:', errorData);
    
    setNailWarning('Unha não detectada na imagem. Não foi possível calcular o tamanho real da ferida.');
    
    // Fallback to regular segmentation
    setLoadingStep('Executando segmentação da ferida...');
    const segmentationResponse = await fetch(`${apiUrl}/segmentation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!segmentationResponse.ok) {
      throw new Error('Falha ao executar segmentação');
    }

    segmentationData = await segmentationResponse.json();
    setSegmentation(segmentationData);
  }
} catch (sizeMeasurementError) {
  console.error('Size measurement error:', sizeMeasurementError);
  setNailWarning('Unha não detectada na imagem. Não foi possível calcular o tamanho real da ferida.');
  
  // Fallback to regular segmentation
  setLoadingStep('Executando segmentação da ferida...');
  const segmentationResponse = await fetch(`${apiUrl}/segmentation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!segmentationResponse.ok) {
    throw new Error('Falha ao executar segmentação');
  }

  segmentationData = await segmentationResponse.json();
  setSegmentation(segmentationData);
}
```

**Step 2: Update the wound_percentage check**

Find the line that checks `if (segmentationData.wound_percentage > 0)` and update to use the local variable:

```typescript
// Step 3: Run tissue classification only if wound area > 0%
const woundDetected = sizeMeasurementData?.dfu_detected ?? (segmentationData?.wound_percentage ?? 0) > 0;
if (woundDetected) {
```

**Step 3: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: replace segmentation call with size-measurement, add fallback logic"
```

---

## Task 5: Add useEffect for Combined Mask Generation

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Add useEffect to generate combined mask when sizeMeasurement changes**

Add after existing useEffect hooks (around line 340):

```typescript
useEffect(() => {
  if (sizeMeasurement && sizeMeasurement.dfu_mask) {
    createCombinedMaskImage(
      sizeMeasurement.dfu_mask,
      sizeMeasurement.nail_mask,
      sizeMeasurement.original_width,
      sizeMeasurement.original_height
    );
  }
}, [sizeMeasurement]);
```

**Step 2: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: add useEffect for combined mask generation on size measurement change"
```

---

## Task 6: Update Mobile UI - Add Nail Warning and Size Display

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Add nail warning display in mobile version (after deepskinWarning around line 660)**

```typescript
{nailWarning && (
  <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded">
    <p className="text-sm text-amber-900 font-medium">Aviso</p>
    <p className="text-xs text-amber-800 mt-1">{nailWarning}</p>
  </div>
)}
```

**Step 2: Update mobile segmentation results section to show combined mask and size info**

Find the mobile segmentation results section (around line 725) and update:

Replace the segmentation image display div with:

```typescript
{/* Segmentation Results */}
{(segmentation || sizeMeasurement) && (maskImageUrl || combinedMaskImageUrl) && (
  <div className="bg-white rounded-lg shadow-md p-4 mb-4">
    <h2 className="text-base font-semibold text-gray-800 mb-3">
      Segmentação da Ferida
    </h2>

    {/* Image Comparison */}
    <div className="space-y-4 mb-4">
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Original</p>
        <img
          src={previewUrl || ''}
          alt="Original"
          className="w-full rounded-lg border border-gray-200"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Segmentação</p>
        <div className="relative overflow-hidden rounded-lg border border-gray-200">
          <img
            src={previewUrl || ''}
            alt="Base"
            className="w-full"
          />
          <img
            src={combinedMaskImageUrl || maskImageUrl || ''}
            alt="Máscara"
            className="absolute top-0 left-0 w-full"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
        {/* Legend */}
        {sizeMeasurement?.nail_detected && (
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-500"></span> Ferida
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-500"></span> Unha
            </span>
          </div>
        )}
      </div>
    </div>

    {/* Stats */}
    <div className="space-y-2">
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-600 mb-1">Área da Ferida</p>
        <p className="text-xl font-bold text-gray-900">
          {segmentation?.wound_percentage?.toFixed(2) ?? '0.00'}%
        </p>
        {(segmentation?.wound_percentage === 0 && !sizeMeasurement?.dfu_detected) && (
          <p className="text-xs text-yellow-600 mt-1">
            Nenhuma ferida detectada
          </p>
        )}
      </div>

      {/* Nail Detection Status */}
      <div className={`rounded-lg p-3 ${sizeMeasurement?.nail_detected ? 'bg-green-50' : 'bg-amber-50'}`}>
        <p className="text-xs text-gray-600 mb-1">Detecção de Unha</p>
        <p className={`text-base font-bold ${sizeMeasurement?.nail_detected ? 'text-green-700' : 'text-amber-700'}`}>
          {sizeMeasurement?.nail_detected ? 'Detectada' : 'Não Detectada'}
        </p>
      </div>

      {/* Size Measurement - Only if nail detected */}
      {sizeMeasurement?.nail_detected && sizeMeasurement?.dfu_detected && (
        <>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">Tamanho Estimado da Ferida</p>
            <p className="text-xl font-bold text-blue-700">
              {sizeMeasurement.dfu_area_cm2.toFixed(2)} cm²
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">Tamanho da unha considerado</p>
            <p className="text-sm font-medium text-gray-900">
              {sizeMeasurement.nail_dimensions.length_mm.toFixed(1)}mm x {sizeMeasurement.nail_dimensions.width_mm.toFixed(1)}mm
            </p>
            <p className="text-xs text-amber-700 mt-2">
              Estimativa considera que a unha e a ferida estão à mesma distância da câmera
            </p>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">Pixels</p>
          <p className="text-base font-bold text-gray-900">
            {segmentation?.wound_pixels?.toLocaleString() ?? '0'}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">Tamanho</p>
          <p className="text-base font-bold text-gray-900">
            {segmentation?.original_width ?? sizeMeasurement?.original_width ?? 0}x{segmentation?.original_height ?? sizeMeasurement?.original_height ?? 0}
          </p>
        </div>
      </div>
    </div>
  </div>
)}
```

**Step 3: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: update mobile UI with nail detection status and size display"
```

---

## Task 7: Update Desktop UI - Add Nail Warning and Size Display

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Add nail warning display in desktop version (after surgwoundWarning around line 948)**

```typescript
{nailWarning && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
    <h3 className="text-amber-900 font-semibold mb-1">Aviso</h3>
    <p className="text-amber-800">{nailWarning}</p>
  </div>
)}
```

**Step 2: Update desktop segmentation results section**

Find the desktop segmentation results section (around line 951) and replace with:

```typescript
{(segmentation || sizeMeasurement) && (maskImageUrl || combinedMaskImageUrl) && (
  <div ref={segmentationRef} className="bg-white rounded-lg shadow-md p-6">
    <div className="flex justify-between items-start mb-4">
      <h2 className="text-xl font-semibold text-gray-800">
        Segmentação da Ferida
      </h2>
      <button
        onClick={clearResults}
        className="text-sm text-gray-600 hover:text-gray-800 underline"
      >
        Limpar Resultados
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Imagem Original</p>
        <div className="overflow-hidden rounded-lg border border-gray-300">
          <img
            src={previewUrl || ''}
            alt="Original"
            className="h-auto w-full"
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Sobreposição de Segmentação</p>
        <div className="relative overflow-hidden rounded-lg border border-gray-300">
          <img
            src={previewUrl || ''}
            alt="Base"
            className="h-auto w-full"
          />
          <img
            src={combinedMaskImageUrl || maskImageUrl || ''}
            alt="Máscara"
            className="absolute top-0 left-0 h-auto w-full"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
        {/* Legend */}
        {sizeMeasurement?.nail_detected && (
          <div className="flex gap-4 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-blue-500"></span> Ferida
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-green-500"></span> Unha
            </span>
          </div>
        )}
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-1">Área da Ferida</p>
        <p className="text-2xl font-bold text-gray-900">
          {segmentation?.wound_percentage?.toFixed(2) ?? '0.00'}%
        </p>
        {(segmentation?.wound_percentage === 0 && !sizeMeasurement?.dfu_detected) && (
          <p className="text-xs text-yellow-600 mt-2">
            Nenhuma ferida detectada
          </p>
        )}
      </div>

      <div className={`rounded-lg p-4 ${sizeMeasurement?.nail_detected ? 'bg-green-50' : 'bg-amber-50'}`}>
        <p className="text-sm text-gray-600 mb-1">Detecção de Unha</p>
        <p className={`text-2xl font-bold ${sizeMeasurement?.nail_detected ? 'text-green-700' : 'text-amber-700'}`}>
          {sizeMeasurement?.nail_detected ? 'Detectada' : 'Não Detectada'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-1">Pixels da Ferida</p>
        <p className="text-2xl font-bold text-gray-900">
          {segmentation?.wound_pixels?.toLocaleString() ?? '0'}
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-1">Tamanho da Imagem</p>
        <p className="text-2xl font-bold text-gray-900">
          {segmentation?.original_width ?? sizeMeasurement?.original_width ?? 0}x{segmentation?.original_height ?? sizeMeasurement?.original_height ?? 0}
        </p>
      </div>
    </div>

    {/* Size Measurement Section - Only if nail detected */}
    {sizeMeasurement?.nail_detected && sizeMeasurement?.dfu_detected && (
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Medição de Tamanho</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-sm font-medium text-blue-800 mb-1">Tamanho Estimado da Ferida</p>
            <p className="text-3xl font-bold text-blue-900">
              {sizeMeasurement.dfu_area_cm2.toFixed(2)} cm²
            </p>
            <p className="text-sm text-blue-700 mt-1">
              ({sizeMeasurement.dfu_dimensions.length_mm.toFixed(1)}mm x {sizeMeasurement.dfu_dimensions.width_mm.toFixed(1)}mm)
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Tamanho da Unha Considerado</p>
            <p className="text-xl font-bold text-gray-900">
              {sizeMeasurement.nail_dimensions.length_mm.toFixed(1)}mm x {sizeMeasurement.nail_dimensions.width_mm.toFixed(1)}mm
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Fonte: {sizeMeasurement.calibration_source === 'user_provided' ? 'Fornecido pelo usuário' : 'Média populacional'}
            </p>
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Nota:</span> A estimativa de tamanho considera que a unha e a ferida estão à mesma distância da câmera.
          </p>
        </div>
      </div>
    )}
  </div>
)}
```

**Step 3: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: update desktop UI with nail detection status and size display"
```

---

## Task 8: Update Loading Step Text and Reset Logic

**Files:**
- Modify: `app/pipeline-demo/page.tsx`

**Step 1: Update handleUploadAndPredict to reset new state at start**

Find the beginning of handleUploadAndPredict function and add resets after existing ones:

```typescript
setIsLoading(true);
setError(null);
setDeepskinWarning(null);
setSurgwoundExudate(null);
setSurgwoundHealing(null);
setSurgwoundInfection(null);
setSurgwoundWarning(null);
setSegmentation(null);
setTissueResult(null);
setMaskImageUrl(null);
// Add these new resets
setSizeMeasurement(null);
setCombinedMaskImageUrl(null);
setNailWarning(null);
```

**Step 2: Verify no TypeScript errors**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/pipeline-demo/page.tsx
git commit -m "feat: update loading step text and reset logic for size measurement"
```

---

## Task 9: Final Testing and Verification

**Step 1: Run TypeScript check**

Run: `cd slic-data-labeler && npx tsc --noEmit`
Expected: No errors

**Step 2: Run development server**

Run: `cd slic-data-labeler && npm run dev`
Expected: Server starts without errors

**Step 3: Manual Testing Checklist**

Test the following scenarios:
1. Upload image with both nail and wound visible
   - Expected: Both masks displayed (blue wound, green nail), size shown in cm²
2. Upload image with wound but no nail
   - Expected: Only wound mask (blue), warning message about nail not detected
3. Upload image with no wound
   - Expected: Message "Nenhuma ferida detectada"
4. Test on mobile viewport
   - Expected: All elements display correctly in mobile layout
5. Test on desktop viewport
   - Expected: All elements display correctly in desktop layout

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete nail segmentation and size comparison feature"
```

---

## Summary

This implementation plan covers:

1. **Task 1**: TypeScript interface for size measurement API response
2. **Task 2**: New state variables for size measurement data
3. **Task 3**: Combined mask image function (wound blue + nail green)
4. **Task 4**: API call logic change from /segmentation to /size-measurement with fallback
5. **Task 5**: useEffect for mask generation on data change
6. **Task 6**: Mobile UI updates with nail status and size display
7. **Task 7**: Desktop UI updates with nail status and size display
8. **Task 8**: Loading text and reset logic updates
9. **Task 9**: Final testing and verification

All UI text is in Brazilian Portuguese as required.
