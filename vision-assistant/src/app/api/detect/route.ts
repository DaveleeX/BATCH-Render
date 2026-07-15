import { NextResponse } from "next/server";
import {
  demoTargetsForFocus,
  detectScreenTargets,
} from "@/lib/detect";
import { getActiveProvider, hasLiveModel } from "@/lib/model";
import type { ScreenTarget } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    imageDataUrl?: string;
    focus?: string;
    hints?: string[];
  };

  const imageDataUrl = String(body.imageDataUrl || "");
  if (!imageDataUrl.startsWith("data:image")) {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }

  const focus = body.focus ? String(body.focus).slice(0, 120) : undefined;
  const hints = Array.isArray(body.hints)
    ? body.hints.map((h) => String(h).slice(0, 40)).slice(0, 5)
    : undefined;

  if (!hasLiveModel()) {
    return NextResponse.json({
      targets: demoTargetsForFocus(focus) as ScreenTarget[],
      mode: "demo" as const,
      provider: getActiveProvider(),
    });
  }

  try {
    const targets = await detectScreenTargets({
      imageDataUrl,
      focus,
      hints,
    });
    return NextResponse.json({
      targets,
      mode: "live" as const,
      provider: getActiveProvider(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "detect_error";
    return NextResponse.json({
      targets: demoTargetsForFocus(focus),
      mode: "demo" as const,
      provider: getActiveProvider(),
      error: message,
    });
  }
}
