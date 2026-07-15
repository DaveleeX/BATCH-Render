/**
 * Client-side patch tracker: keeps pins sticky between slow vision polls.
 */

export type TrackBox = {
  cx: number;
  cy: number;
  w: number;
  h: number;
};

type PatchState = {
  gray: Float32Array;
  pw: number;
  ph: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function toGray(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return out;
}

function samplePatch(
  video: HTMLVideoElement,
  box: TrackBox,
  workW = 160,
): { patch: PatchState; box: TrackBox } | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const aspect = video.videoWidth / video.videoHeight;
  const canvasW = workW;
  const canvasH = Math.max(1, Math.round(workW / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvasW, canvasH);

  const pw = Math.max(8, Math.round(box.w * canvasW));
  const ph = Math.max(8, Math.round(box.h * canvasH));
  const x0 = clamp(Math.round(box.cx * canvasW - pw / 2), 0, canvasW - pw);
  const y0 = clamp(Math.round(box.cy * canvasH - ph / 2), 0, canvasH - ph);
  const img = ctx.getImageData(x0, y0, pw, ph);
  return {
    patch: { gray: toGray(img.data, pw, ph), pw, ph },
    box: {
      cx: (x0 + pw / 2) / canvasW,
      cy: (y0 + ph / 2) / canvasH,
      w: pw / canvasW,
      h: ph / canvasH,
    },
  };
}

function sadScore(
  frame: Float32Array,
  fw: number,
  fh: number,
  patch: PatchState,
  x: number,
  y: number,
): number {
  let sum = 0;
  const { gray, pw, ph } = patch;
  for (let row = 0; row < ph; row++) {
    const fOff = (y + row) * fw + x;
    const pOff = row * pw;
    for (let col = 0; col < pw; col++) {
      sum += Math.abs(frame[fOff + col] - gray[pOff + col]);
    }
  }
  return sum / (pw * ph);
}

/**
 * Search near previous box; return updated normalized center or null if lost.
 */
export function trackBoxStep(
  video: HTMLVideoElement,
  box: TrackBox,
  patch: PatchState | null,
  workW = 160,
): { box: TrackBox; patch: PatchState; score: number } | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const aspect = video.videoWidth / video.videoHeight;
  const canvasW = workW;
  const canvasH = Math.max(1, Math.round(workW / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvasW, canvasH);
  const frameImg = ctx.getImageData(0, 0, canvasW, canvasH);
  const frame = toGray(frameImg.data, canvasW, canvasH);

  let activePatch = patch;
  if (!activePatch) {
    const sampled = samplePatch(video, box, workW);
    if (!sampled) return null;
    activePatch = sampled.patch;
  }

  const { pw, ph } = activePatch;
  const searchR = Math.max(8, Math.round(Math.max(canvasW, canvasH) * 0.12));
  const cxPx = Math.round(box.cx * canvasW);
  const cyPx = Math.round(box.cy * canvasH);
  const xMin = clamp(cxPx - searchR - Math.floor(pw / 2), 0, canvasW - pw);
  const xMax = clamp(cxPx + searchR - Math.floor(pw / 2), 0, canvasW - pw);
  const yMin = clamp(cyPx - searchR - Math.floor(ph / 2), 0, canvasH - ph);
  const yMax = clamp(cyPx + searchR - Math.floor(ph / 2), 0, canvasH - ph);

  let best = Infinity;
  let bestX = xMin;
  let bestY = yMin;
  const step = pw > 24 ? 2 : 1;
  for (let y = yMin; y <= yMax; y += step) {
    for (let x = xMin; x <= xMax; x += step) {
      const s = sadScore(frame, canvasW, canvasH, activePatch, x, y);
      if (s < best) {
        best = s;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Resample patch at best location for next frame drift
  const img = ctx.getImageData(bestX, bestY, pw, ph);
  const nextPatch: PatchState = {
    gray: toGray(img.data, pw, ph),
    pw,
    ph,
  };

  return {
    box: {
      cx: (bestX + pw / 2) / canvasW,
      cy: (bestY + ph / 2) / canvasH,
      w: box.w,
      h: box.h,
    },
    patch: nextPatch,
    score: best,
  };
}

export function createPatch(
  video: HTMLVideoElement,
  box: TrackBox,
): PatchState | null {
  return samplePatch(video, box)?.patch || null;
}

export type PatchStateHandle = PatchState;
