import { jsPDF } from 'jspdf';

export interface PipelineReportSurgwoundModality {
  modality: string;
  predicted_label: string;
  confidence: number;
}

export interface PipelineReportLaserInput {
  tecido: string | null;
  qtd_exudato: string | null;
  tipo_exsudato: string | null;
  sinais_infeccao: boolean;
  status: string | null;
}

export interface PipelineInferenceCallDbRow {
  id: string;
  endpoint: string;
  image_id: string;
  created_at?: string | null;
}

export interface PipelineAuditClientRow {
  endpoint: string;
  imageId: string | null;
  inferenceCallId: string | null;
  observationId: string | null;
}

export interface PipelineReportSegmentationVisualization {
  dfu_mask: number[][];
  reference_mask: number[][] | null;
  original_width: number;
  original_height: number;
}

export interface PipelineReportInput {
  apiUrl: string | null;
  imageBase64: string | null;
  fp: {
    predicted_class: string;
    needs_retry_photo: boolean;
    probabilities: Record<string, number>;
  } | null;
  fpAdvice: string | null;
  warnings: {
    nail: string | null;
    deepskin: string | null;
    surgwound: string | null;
  };
  segmentation: {
    wound_percentage: number;
    wound_pixels: number;
    original_width: number;
    original_height: number;
  } | null;
  /** Raster source for wound + optional reference overlay in the PDF. */
  segmentationVisualization: PipelineReportSegmentationVisualization | null;
  /** User-selected sizing path in the pipeline demo (stored for PDF context). */
  size_calibration_method: 'aruco' | 'nail';
  sizeMeasurement: {
    dfu_area_cm2: number;
    dfu_area_mm2: number;
    nail_detected: boolean;
    /** Present when sizing used OpenCV ArUco markers on the strip. */
    aruco_detected?: boolean;
    dfu_detected: boolean;
    px_per_mm: number;
    calibration_source: string;
    dfu_dimensions: { length_mm: number; width_mm: number };
    nail_dimensions?: { length_mm: number; width_mm: number } | null;
    printed_marker_square_side_mm?: number | null;
    original_width: number;
    original_height: number;
  } | null;
  tissue: {
    xgboost_tissue_type: string;
    xgboost_slough_amount: string;
  } | null;
  deepskin: { pwat_score: number } | null;
  deepskinWarning: string | null;
  surgwound: {
    exudate: PipelineReportSurgwoundModality | null;
    healing: PipelineReportSurgwoundModality | null;
    infection: PipelineReportSurgwoundModality | null;
  };
  laser: {
    message: string;
    input: PipelineReportLaserInput;
  } | null;
  observationDraft: string;
  auditClientTrail: PipelineAuditClientRow[];
  auditDbRows: PipelineInferenceCallDbRow[] | null;
  auditDbError: string | null;
}

const marginMm = 14;
const maxTextWidthMm = 182;

function ensureSpace(doc: jsPDF, y: number, neededMm: number): number {
  const pageHeight: number = doc.internal.pageSize.getHeight();
  if (y + neededMm > pageHeight - 10) {
    doc.addPage();
    return marginMm + 6;
  }
  return y;
}

function addHeading(doc: jsPDF, y: number, title: string): number {
  let nextY: number = ensureSpace(doc, y, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(title, marginMm, nextY);
  return nextY + 7;
}

function addParagraph(doc: jsPDF, y: number, text: string): number {
  let nextY: number = y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines: string[] = doc.splitTextToSize(text, maxTextWidthMm);
  for (let i = 0; i < lines.length; i += 1) {
    nextY = ensureSpace(doc, nextY, 8);
    doc.text(lines[i], marginMm, nextY);
    nextY += 5;
  }
  return nextY + 2;
}

function resolveImageSrcFromBase64Field(imageBase64: string): string {
  const trimmed = imageBase64.trim();
  if (/^data:/i.test(trimmed)) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

function loadHtmlImageFromSrc(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      resolve(img);
    };
    img.onerror = (): void => {
      reject(new Error('failed to decode image'));
    };
    img.src = imageSrc;
  });
}

async function buildSegmentationOverlayPngDataUrl(params: {
  imageBase64: string;
  visualization: PipelineReportSegmentationVisualization;
}): Promise<string | null> {
  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined'
  ) {
    return null;
  }

  const { visualization } = params;
  const imgSrc: string = resolveImageSrcFromBase64Field(params.imageBase64);

  let w =
    visualization.original_width > 0
      ? Math.round(visualization.original_width)
      : visualization.dfu_mask[0]?.length ?? 0;
  let h =
    visualization.original_height > 0
      ? Math.round(visualization.original_height)
      : visualization.dfu_mask.length;

  const dfuRows = visualization.dfu_mask.length;
  const dfuCols =
    visualization.dfu_mask.length > 0
      ? (visualization.dfu_mask[0]?.length ?? 0)
      : 0;

  if (dfuRows > 0 && dfuCols > 0 && (dfuCols !== w || dfuRows !== h)) {
    w = dfuCols;
    h = dfuRows;
  }

  if (w < 1 || h < 1) {
    return null;
  }

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  const oCtx = overlayCanvas.getContext('2d');
  if (oCtx === null) {
    return null;
  }

  const imageData = oCtx.createImageData(w, h);
  const ref = visualization.reference_mask;

  for (let yPx = 0; yPx < h; yPx += 1) {
    for (let xPx = 0; xPx < w; xPx += 1) {
      const idx = (yPx * w + xPx) * 4;
      const dfuValue =
        visualization.dfu_mask[yPx] !== undefined
          ? (visualization.dfu_mask[yPx][xPx] ?? 0)
          : 0;
      const refValue =
        ref !== null &&
        ref[yPx] !== undefined
          ? (ref[yPx][xPx] ?? 0)
          : 0;

      if (dfuValue > 0) {
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 180;
      } else if (refValue > 0) {
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 255;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 180;
      } else {
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 0;
      }
    }
  }

  oCtx.putImageData(imageData, 0, 0);

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = w;
  baseCanvas.height = h;
  const bCtx = baseCanvas.getContext('2d');
  if (bCtx === null) {
    return null;
  }

  try {
    const photo = await loadHtmlImageFromSrc(imgSrc);
    bCtx.drawImage(photo, 0, 0, w, h);
    bCtx.globalCompositeOperation = 'multiply';
    bCtx.drawImage(overlayCanvas, 0, 0);
    bCtx.globalCompositeOperation = 'source-over';
  } catch {
    return null;
  }

  return baseCanvas.toDataURL('image/png');
}

export async function downloadPipelineReport(input: PipelineReportInput): Promise<void> {
  const doc: jsPDF = new jsPDF({ unit: 'mm', format: 'a4' });
  let y: number = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Relatório de análise — Pipeline DFU', marginMm, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginMm, y);
  y += 5;
  if (input.apiUrl !== null && input.apiUrl !== '') {
    doc.text(`API: ${input.apiUrl}`, marginMm, y);
    y += 5;
  }
  doc.setTextColor(0, 0, 0);
  y += 4;

  const hasClientAudit: boolean = input.auditClientTrail.length > 0;
  const hasDbAudit: boolean =
    input.auditDbRows !== null && input.auditDbRows.length > 0;
  const hasDbErr: boolean =
    input.auditDbError !== null && input.auditDbError !== '';
  if (hasClientAudit || hasDbAudit || hasDbErr) {
    y = addHeading(doc, y, 'Auditoria (Supabase / inferência)');
    if (hasClientAudit) {
      y = addParagraph(
        doc,
        y,
        'Registros devolvidos pela API nesta sessão (_audit em cada resposta):'
      );
      for (let i = 0; i < input.auditClientTrail.length; i += 1) {
        const row = input.auditClientTrail[i];
        const parts: string[] = [row.endpoint];
        if (row.imageId !== null) {
          parts.push(`image_id=${row.imageId}`);
        }
        if (row.inferenceCallId !== null) {
          parts.push(`inference_calls.id=${row.inferenceCallId}`);
        }
        if (row.observationId !== null) {
          parts.push(`observation_id=${row.observationId}`);
        }
        y = addParagraph(doc, y, parts.join(' · '));
      }
    }
    if (hasDbErr) {
      y = addParagraph(
        doc,
        y,
        `Não foi possível consultar o Supabase (${input.auditDbError}). Verifique RLS/políticas de leitura em inference_calls ou as credenciais.`
      );
    }
    y += 2;
  }

  if (input.imageBase64 !== null && input.imageBase64 !== '') {
    const dataUrl: string = `data:image/jpeg;base64,${input.imageBase64}`;
    try {
      const imgProps = doc.getImageProperties(dataUrl);
      const displayWidthMm = 110;
      const displayHeightMm: number =
        (imgProps.height * displayWidthMm) / imgProps.width;
      y = ensureSpace(doc, y, displayHeightMm + 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Imagem analisada', marginMm, y);
      y += 6;
      doc.addImage(
        dataUrl,
        'JPEG',
        marginMm,
        y,
        displayWidthMm,
        displayHeightMm
      );
      y += displayHeightMm + 8;
    } catch {
      doc.setFontSize(10);
      doc.text('(Não foi possível incluir a imagem neste PDF)', marginMm, y);
      y += 8;
    }
  }

  const w = input.warnings;
  if (w.nail !== null || w.deepskin !== null || w.surgwound !== null) {
    const hasAny: boolean =
      (w.nail !== null && w.nail !== '') ||
      (w.deepskin !== null && w.deepskin !== '') ||
      (w.surgwound !== null && w.surgwound !== '');
    if (hasAny) {
      y = addHeading(doc, y, 'Avisos');
      if (w.nail !== null && w.nail !== '') {
        y = addParagraph(doc, y, `Unha / medição: ${w.nail}`);
      }
      if (w.deepskin !== null && w.deepskin !== '') {
        y = addParagraph(doc, y, `Deepskin: ${w.deepskin}`);
      }
      if (w.surgwound !== null && w.surgwound !== '') {
        y = addParagraph(doc, y, `SurgWound: ${w.surgwound}`);
      }
    }
  }

  if (input.fp !== null) {
    y = addHeading(doc, y, 'Pré-checagem FP');
    y = addParagraph(doc, y, `Classe prevista: ${input.fp.predicted_class}`);
    y = addParagraph(
      doc,
      y,
      `Precisa refazer foto: ${input.fp.needs_retry_photo ? 'Sim' : 'Não'}`
    );
    const probLine: string = Object.entries(input.fp.probabilities)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .map(
        (entry: [string, number]) =>
          `${entry[0]}: ${(entry[1] * 100).toFixed(1)}%`
      )
      .join(' · ');
    y = addParagraph(doc, y, `Probabilidades: ${probLine}`);
    if (input.fpAdvice !== null && input.fpAdvice !== '') {
      y = addParagraph(doc, y, `Nota: ${input.fpAdvice}`);
    }
  }

  if (input.segmentation !== null || input.sizeMeasurement !== null) {
    y = addHeading(doc, y, 'Segmentação e dimensões');
    if (input.segmentation !== null) {
      const s = input.segmentation;
      y = addParagraph(
        doc,
        y,
        `Área da ferida (estimativa): ${s.wound_percentage.toFixed(2)}%`
      );
      y = addParagraph(
        doc,
        y,
        `Pixels da ferida: ${s.wound_pixels.toLocaleString('pt-BR')}`
      );
      y = addParagraph(
        doc,
        y,
        `Tamanho da imagem: ${String(s.original_width)} × ${String(s.original_height)} px`
      );
    }
    if (input.sizeMeasurement !== null) {
      const sm = input.sizeMeasurement;
      const methodPt: string =
        input.size_calibration_method === 'aruco'
          ? 'ArUco (marcadores 0 e 1 na tira)'
          : 'Unha';
      y = addParagraph(doc, y, `Método de escala (demo): ${methodPt}`);
      y = addParagraph(
        doc,
        y,
        `Unha detectada: ${sm.nail_detected ? 'Sim' : 'Não'}`
      );
      if (sm.aruco_detected === true) {
        y = addParagraph(doc, y, 'ArUco: calibração ok (marcadores na imagem).');
      }
      y = addParagraph(
        doc,
        y,
        `DFU detectada: ${sm.dfu_detected ? 'Sim' : 'Não'}`
      );
      const hasScaleRef: boolean =
        sm.dfu_detected &&
        ((sm.aruco_detected === true &&
          input.size_calibration_method === 'aruco') ||
          (sm.nail_detected && input.size_calibration_method === 'nail'));
      if (hasScaleRef) {
        y = addParagraph(
          doc,
          y,
          `Área DFU: ${sm.dfu_area_cm2.toFixed(2)} cm² (${sm.dfu_area_mm2.toFixed(0)} mm²)`
        );
        y = addParagraph(
          doc,
          y,
          `Dimensões DFU: ${sm.dfu_dimensions.length_mm.toFixed(1)} × ${sm.dfu_dimensions.width_mm.toFixed(1)} mm`
        );
        if (
          input.size_calibration_method === 'nail' &&
          sm.nail_dimensions !== null &&
          sm.nail_dimensions !== undefined
        ) {
          y = addParagraph(
            doc,
            y,
            `Referência unha: ${sm.nail_dimensions.length_mm.toFixed(1)} × ${sm.nail_dimensions.width_mm.toFixed(1)} mm`
          );
        }
        if (
          input.size_calibration_method === 'aruco' &&
          sm.printed_marker_square_side_mm !== null &&
          sm.printed_marker_square_side_mm !== undefined
        ) {
          y = addParagraph(
            doc,
            y,
            `Lado impresso do marcador ArUco: ${sm.printed_marker_square_side_mm.toFixed(1)} mm`
          );
        }
        y = addParagraph(
          doc,
          y,
          `px/mm: ${sm.px_per_mm.toFixed(4)} · Calibração: ${sm.calibration_source}`
        );
      }
    }

    const imageB64Raw: string | null = input.imageBase64;
    if (
      input.segmentationVisualization !== null &&
      imageB64Raw !== null &&
      imageB64Raw !== ''
    ) {
      const hasReferenceBand: boolean =
        input.segmentationVisualization.reference_mask !== null;
      y = addParagraph(
        doc,
        y,
        hasReferenceBand
          ? 'Segue a vista com segmentação sobreposta (idem à demo: multiply — azul/índigo = ferida, verde teñido = referência de unha ou marcadores ArUco).'
          : 'Segue a vista só com máscara da ferida sobreposta (idem à demo).'
      );
      const pngDataUrl: string | null = await buildSegmentationOverlayPngDataUrl({
        imageBase64: imageB64Raw,
        visualization: input.segmentationVisualization,
      });
      if (pngDataUrl !== null) {
        try {
          const segProps = doc.getImageProperties(pngDataUrl);
          const segWidthMm = 110;
          const segHeightMm: number =
            (segProps.height * segWidthMm) / segProps.width;
          y = ensureSpace(doc, y, segHeightMm + 10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text('Imagem — segmentação (ferida e referência se houver)', marginMm, y);
          y += 6;
          doc.addImage(
            pngDataUrl,
            'PNG',
            marginMm,
            y,
            segWidthMm,
            segHeightMm
          );
          y += segHeightMm + 8;
        } catch {
          y = addParagraph(
            doc,
            y,
            '(Figura da segmentação: falha ao inserir no PDF.)'
          );
        }
      } else {
        y = addParagraph(
          doc,
          y,
          '(Não foi possível rasterizar máscaras no navegador; exporte só com texto acima.)'
        );
      }
    }
  }

  if (input.tissue !== null) {
    y = addHeading(doc, y, 'Classificação de tecido');
    y = addParagraph(doc, y, `Tipo de tecido: ${input.tissue.xgboost_tissue_type}`);
    y = addParagraph(
      doc,
      y,
      `Exsudato (modelo): ${input.tissue.xgboost_slough_amount}`
    );
  }

  if (input.deepskin !== null) {
    y = addHeading(doc, y, 'Deepskin (PWAT)');
    y = addParagraph(
      doc,
      y,
      `Score PWAT: ${input.deepskin.pwat_score.toFixed(2)}`
    );
  }
  if (input.deepskinWarning !== null && input.deepskinWarning !== '') {
    y = addParagraph(doc, y, `Aviso Deepskin: ${input.deepskinWarning}`);
  }

  const sw = input.surgwound;
  const swAny: boolean =
    sw.exudate !== null || sw.healing !== null || sw.infection !== null;
  if (swAny) {
    y = addHeading(doc, y, 'SurgWound');
    const addMod = (
      label: string,
      r: PipelineReportSurgwoundModality | null
    ): void => {
      if (r === null) {
        return;
      }
      y = addParagraph(
        doc,
        y,
        `${label}: ${r.predicted_label} (confiança ${(r.confidence * 100).toFixed(1)}%) — ${r.modality}`
      );
    };
    addMod('Tipo de exsudato', sw.exudate);
    addMod('Estado de cicatrização', sw.healing);
    addMod('Risco de infeção', sw.infection);
  }

  if (input.laser !== null) {
    y = addHeading(doc, y, 'Modulação laser (regra local)');
    y = addParagraph(doc, y, input.laser.message);
    const li = input.laser.input;
    y = addParagraph(doc, y, `Tecido: ${li.tecido ?? 'N/A'}`);
    y = addParagraph(doc, y, `Qtd. exsudato: ${li.qtd_exudato ?? 'N/A'}`);
    y = addParagraph(doc, y, `Tipo de exsudato: ${li.tipo_exsudato ?? 'N/A'}`);
    y = addParagraph(doc, y, `Status: ${li.status ?? 'N/A'}`);
    y = addParagraph(
      doc,
      y,
      `Sinais de infecção: ${li.sinais_infeccao ? 'Sim' : 'Não'}`
    );
  }

  const draft: string = input.observationDraft.trim();
  if (draft !== '') {
    y = addHeading(doc, y, 'Observações (campo do formulário)');
    y = addParagraph(
      doc,
      y,
      draft + ' — (salve em “Salvar observação” se precisar persistir na API.)'
    );
  }

  const stamp: string = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  doc.save(`analise-dfu-${stamp}.pdf`);
}
