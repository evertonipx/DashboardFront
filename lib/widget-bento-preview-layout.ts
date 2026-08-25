export type ResolveWidgetBentoPreviewGeometryInput = {
  availableWidth: number;
  sourceGap: number;
  sourceRowHeight: number;
  sourceWidth: number;
};

export type WidgetBentoPreviewGeometry = {
  canvasWidth: number;
  gap: number;
  rowHeight: number;
  scale: number;
};

/**
 * Fits the real dashboard canvas into the preview without changing its aspect
 * ratio. A single scale is deliberately shared by width, row height and gap;
 * otherwise the same grid spans produce flattened thumbnails.
 */
export function resolveWidgetBentoPreviewGeometry({
  availableWidth,
  sourceGap,
  sourceRowHeight,
  sourceWidth,
}: ResolveWidgetBentoPreviewGeometryInput): WidgetBentoPreviewGeometry {
  const safeAvailableWidth = normalizePositiveNumber(availableWidth);
  const safeSourceWidth = normalizePositiveNumber(sourceWidth);
  const safeSourceRowHeight = normalizePositiveNumber(sourceRowHeight) || 1;
  const safeSourceGap = normalizeNonNegativeNumber(sourceGap);
  const scale =
    safeAvailableWidth > 0 && safeSourceWidth > 0
      ? Math.min(1, safeAvailableWidth / safeSourceWidth)
      : 1;
  const canvasWidth =
    safeAvailableWidth > 0 && safeSourceWidth > 0
      ? safeSourceWidth * scale
      : safeAvailableWidth > 0
        ? safeAvailableWidth
        : safeSourceWidth;

  return {
    canvasWidth,
    gap: safeSourceGap * scale,
    rowHeight: safeSourceRowHeight * scale,
    scale,
  };
}

export function resolveWidgetBentoSpanPixels(
  span: number,
  trackSize: number,
  gap: number,
) {
  const safeSpan = normalizePositiveInteger(span);
  const safeTrackSize = normalizeNonNegativeNumber(trackSize);
  const safeGap = normalizeNonNegativeNumber(gap);
  return safeSpan * safeTrackSize + (safeSpan - 1) * safeGap;
}

function normalizePositiveInteger(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function normalizePositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeNonNegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
