/**
 * Lightweight client patch tracker — reused canvas, coarse search, no per-frame alloc storms.
 */

export type TrackBox = {
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type PatchStateHandle = {
  gray: Float32Array;
  pw: number;
  ph: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function toGray(data: Uint8ClampedArray, w: number, h: number, out?: Float32Array) {
  const buf = out && out.length >= w * h ? out : new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    buf[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return buf;
}

/** Shared scratch for all trackers on page */
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let sharedFrameGray: Float32Array | null = null;

function getScratch(workW: number, workH: number) {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCtx = sharedCanvas.getContext("2d", {
      willReadFrequently: true,
      alpha: false,
    });
  }
  if (!sharedCtx) return null;
  if (sharedCanvas.width !== workW || sharedCanvas.height !== workH) {
    sharedCanvas.width = workW;
    sharedCanvas.height = workH;
  }
  return sharedCtx;
}

function sadScore(
  frame: Float32Array,
  fw: number,
  patch: PatchStateHandle,
  x: number,
  y: number,
): number {
  let sum = 0;
  const { gray, pw, ph } = patch;
  // subsample every 2nd pixel inside patch for speed
  for (let row = 0; row < ph; row += 2) {
    const fOff = (y + row) * fw + x;
    const pOff = row * pw;
    for (let col = 0; col < pw; col += 2) {
      sum += Math.abs(frame[fOff + col] - gray[pOff + col]);
    }
  }
  return sum;
}

export function createPatch(
  video: HTMLVideoElement,
  box: TrackBox,
  workW = 96,
): PatchStateHandle | null {
  if (!video.videoWidth) return null;
  const aspect = video.videoWidth / video.videoHeight;
  const canvasH = Math.max(1, Math.round(workW / aspect));
  const ctx = getScratch(workW, canvasH);
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, workW, canvasH);

  const pw = clamp(Math.round(box.w * workW), 10, 22);
  const ph = clamp(Math.round(box.h * canvasH), 10, 22);
  const x0 = clamp(Math.round(box.cx * workW - pw / 2), 0, workW - pw);
  const y0 = clamp(Math.round(box.cy * canvasH - ph / 2), 0, canvasH - ph);
  const img = ctx.getImageData(x0, y0, pw, ph);
  return { gray: toGray(img.data, pw, ph), pw, ph };
}

/**
 * One cheap search step. Returns null if frame unavailable.
 */
export function trackBoxStep(
  video: HTMLVideoElement,
  box: TrackBox,
  patch: PatchStateHandle | null,
  workW = 96,
): { box: TrackBox; patch: PatchStateHandle; score: number } | null {
  if (!video.videoWidth) return null;
  const aspect = video.videoWidth / video.videoHeight;
  const canvasH = Math.max(1, Math.round(workW / aspect));
  const ctx = getScratch(workW, canvasH);
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, workW, canvasH);
  const frameImg = ctx.getImageData(0, 0, workW, canvasH);
  sharedFrameGray = toGray(
    frameImg.data,
    workW,
    canvasH,
    sharedFrameGray || undefined,
  );
  const frame = sharedFrameGray;

  let active = patch || createPatch(video, box, workW);
  if (!active) return null;

  // Cap patch cost
  if (active.pw > 22 || active.ph > 22) {
    active = {
      ...active,
      pw: Math.min(active.pw, 22),
      ph: Math.min(active.ph, 22),
    };
  }

  const { pw, ph } = active;
  const searchR = Math.max(6, Math.round(Math.max(workW, canvasH) * 0.08));
  const cxPx = Math.round(box.cx * workW);
  const cyPx = Math.round(box.cy * canvasH);
  const xMin = clamp(cxPx - searchR - (pw >> 1), 0, workW - pw);
  const xMax = clamp(cxPx + searchR - (pw >> 1), 0, workW - pw);
  const yMin = clamp(cyPx - searchR - (ph >> 1), 0, canvasH - ph);
  const yMax = clamp(cyPx + searchR - (ph >> 1), 0, canvasH - ph);

  let best = Infinity;
  let bestX = xMin;
  let bestY = yMin;
  const step = 3;
  for (let y = yMin; y <= yMax; y += step) {
    for (let x = xMin; x <= xMax; x += step) {
      const s = sadScore(frame, workW, active, x, y);
      if (s < best) {
        best = s;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Refine 1px around best
  for (let y = bestY - 2; y <= bestY + 2; y++) {
    for (let x = bestX - 2; x <= bestX + 2; x++) {
      if (x < 0 || y < 0 || x > workW - pw || y > canvasH - ph) continue;
      const s = sadScore(frame, workW, active, x, y);
      if (s < best) {
        best = s;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Refresh template every step is expensive — only occasionally via caller
  return {
    box: {
      cx: (bestX + pw / 2) / workW,
      cy: (bestY + ph / 2) / canvasH,
      w: box.w,
      h: box.h,
    },
    patch: active,
    score: best / ((pw * ph) / 4),
  };
}
