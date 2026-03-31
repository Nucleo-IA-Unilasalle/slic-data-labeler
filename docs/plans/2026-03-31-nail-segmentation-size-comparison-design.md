# Nail Segmentation & Size Comparison Feature Design

**Date:** 2026-03-31  
**Status:** Approved  
**Target:** Pipeline-demo page in slic-data-labeler

## Overview

Add nail segmentation and size comparison functionality to the pipeline-demo page. The system will detect fingernails in wound images and use them as a reference to calculate real-world wound size in cm².

## Requirements

1. Always attempt size comparison when analyzing images
2. Display nail detection status (detected/not detected)
3. If nail detected: display both wound and nail masks, show wound size in cm²
4. If nail NOT detected: show wound mask only with warning message
5. All UI text in Brazilian Portuguese

## Approach

**Selected: Approach A - Replace segmentation with size-measurement call**

Call `/size-measurement` endpoint instead of `/segmentation`. This single call returns both wound mask AND nail mask plus measurements. Fallback to `/segmentation` if nail not detected.

**Rationale:**
- Single API call for both masks (efficient)
- Size-measurement endpoint already includes wound segmentation
- Clean data flow

## API Integration

### New Endpoint

```
POST /size-measurement
Body: { image: base64, include_masks: true }
```

### Response Interface

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

### Error Handling

- Nail NOT detected: API returns 400 with `{ nail_detected: false }`
- Fallback: Call `/segmentation` to get wound mask
- Display warning message to user

## State Management

Keep existing state for backward compatibility, add new state:

```typescript
// Existing
const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);

// New
const [sizeMeasurement, setSizeMeasurement] = useState<SizeMeasurementResult | null>(null);
const [nailMaskImageUrl, setNailMaskImageUrl] = useState<string | null>(null);
const [combinedMaskImageUrl, setCombinedMaskImageUrl] = useState<string | null>(null);
```

## Data Flow

```
1. User uploads image
2. Call /size-measurement with include_masks: true
3. Handle response:
   
   IF nail_detected && dfu_detected:
     - Set sizeMeasurement with full response
     - Create combined mask image (wound blue + nail green)
     - Display size in cm², nail dimensions, disclaimer
   
   IF !nail_detected:
     - Fallback: call /segmentation to get wound mask
     - Create wound-only mask image (blue)
     - Display warning: "Unha não detectada"
   
   IF !dfu_detected:
     - Display: "Nenhuma ferida detectada"

4. Continue with tissue classification (if wound detected)
```

## UI Design

### Mask Colors
- **Wound (DFU):** Blue (RGBA: 0, 0, 255, 180)
- **Nail:** Green (RGBA: 0, 255, 0, 180)

### Layout - Nail Detected

```
┌─────────────────────────────────────────────────────────────┐
│  Segmentação da Ferida                                      │
├─────────────────────────────────────────────────────────────┤
│  [Original Image]     [Combined Mask Overlay]               │
│                                                             │
│  Legend: 🔵 Ferida  🟢 Unha                                 │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Área Ferida │  │ Unha        │  │ Tamanho Estimado    │  │
│  │ 2.45%       │  │ Detectada ✓ │  │ da Ferida           │  │
│  │             │  │             │  │ 1.25 cm²            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Tamanho da unha considerado: 15.0mm x 13.0mm            ││
│  │ ⚠️ Estimativa considera que a unha e a ferida estão     ││
│  │   à mesma distância da câmera                           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Layout - Nail NOT Detected

```
┌─────────────────────────────────────────────────────────────┐
│  Segmentação da Ferida                                      │
├─────────────────────────────────────────────────────────────┤
│  [Original Image]     [Wound Mask Overlay Only]             │
│                                                             │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │ Área Ferida │  │ ⚠️ Unha não detectada               │   │
│  │ 2.45%       │  │ Não foi possível calcular o         │   │
│  │             │  │ tamanho real da ferida              │   │
│  └─────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Files to Modify

1. `app/pipeline-demo/page.tsx` - Main implementation
2. `lib/types/` - Add new TypeScript interfaces (optional, can be inline)

## Testing

1. Test with images containing both nail and wound
2. Test with images containing wound but no nail
3. Test with images containing neither
4. Verify fallback to /segmentation works
5. Verify all text displays in Portuguese
