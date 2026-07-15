import { nanoid } from "nanoid";
import { quickVisionText } from "@/lib/model";
import type { ScreenTarget } from "@/lib/types";

export type { ScreenTarget };

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeTargets(input: unknown, limit = 5): ScreenTarget[] {
  if (!input || typeof input !== "object") return [];
  const root = input as { targets?: unknown };
  const list = Array.isArray(root.targets)
    ? root.targets
    : Array.isArray(input)
      ? input
      : [];

  const out: ScreenTarget[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label || row.name || "").trim();
    if (!label) continue;

    let cx = Number(row.cx ?? row.x);
    let cy = Number(row.cy ?? row.y);
    let w = Number(row.w ?? row.width ?? 0.18);
    let h = Number(row.h ?? row.height ?? 0.18);

    // Accept bbox style [x1,y1,x2,y2]
    if (
      (!Number.isFinite(cx) || !Number.isFinite(cy)) &&
      Array.isArray(row.bbox) &&
      row.bbox.length >= 4
    ) {
      const x1 = Number(row.bbox[0]);
      const y1 = Number(row.bbox[1]);
      const x2 = Number(row.bbox[2]);
      const y2 = Number(row.bbox[3]);
      cx = (x1 + x2) / 2;
      cy = (y1 + y2) / 2;
      w = Math.abs(x2 - x1);
      h = Math.abs(y2 - y1);
    }

    // Percent 0-100 → 0-1
    if (cx > 1.5 || cy > 1.5) {
      cx /= 100;
      cy /= 100;
      if (w > 1.5) w /= 100;
      if (h > 1.5) h /= 100;
    }

    out.push({
      id: String(row.id || nanoid(8)),
      label: label.slice(0, 24),
      cx: clamp01(cx),
      cy: clamp01(cy),
      w: Math.min(0.9, Math.max(0.06, clamp01(w) || 0.18)),
      h: Math.min(0.9, Math.max(0.06, clamp01(h) || 0.18)),
      confidence:
        typeof row.confidence === "number"
          ? row.confidence
          : typeof row.score === "number"
            ? row.score
            : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseTargetsFromModelText(raw: string): ScreenTarget[] {
  const parsed = extractJsonObject(raw);
  return normalizeTargets(parsed);
}

const DETECT_SYSTEM = `你是屏幕空间目标定位器。根据单帧摄像头画面，找出用户关心的物体，并返回它们在画面中的位置。
坐标约定：原点在画面左上角，cx/cy 为物体中心点归一化坐标（0~1），w/h 为包围盒宽高（0~1）。
只输出 JSON，不要解释，不要 Markdown。`;

export async function detectScreenTargets(params: {
  imageDataUrl: string;
  focus?: string;
  hints?: string[];
}): Promise<ScreenTarget[]> {
  const hintLine =
    params.hints && params.hints.length
      ? `优先跟踪并更新这些已有目标的位置：${params.hints.join("、")}。若仍在画面中请保留同一 label。`
      : "";
  const focusLine = params.focus
    ? `用户问题/关注点：${params.focus}。优先标出与此相关的物体（例如手办、杯子、人、商品）。`
    : "标出画面中最显著、最可能被提问的 1-3 个物体。";

  const prompt = `${focusLine}
${hintLine}
输出格式严格如下：
{"targets":[{"label":"手办","cx":0.52,"cy":0.48,"w":0.22,"h":0.36,"confidence":0.86}]}
要求：最多 3 个；label 用简短中文；坐标必须合理；看不清可返回 {"targets":[]}。`;

  const text = await quickVisionText({
    system: DETECT_SYSTEM,
    prompt,
    imageDataUrl: params.imageDataUrl,
  });

  if (!text) return [];
  return parseTargetsFromModelText(text);
}

export function demoTargetsForFocus(focus?: string): ScreenTarget[] {
  const label =
    focus && /手办|人偶|公仔|模型/.test(focus)
      ? "手办"
      : focus && /杯|咖啡/.test(focus)
        ? "杯子"
        : focus && /人|谁|脸/.test(focus)
          ? "人物"
          : "目标";
  return [
    {
      id: nanoid(8),
      label,
      cx: 0.5,
      cy: 0.46,
      w: 0.28,
      h: 0.34,
      confidence: 0.5,
    },
  ];
}
