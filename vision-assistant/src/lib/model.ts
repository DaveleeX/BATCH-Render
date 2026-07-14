import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

export function hasLiveModel(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY,
  );
}

/** Prefer models that still accept new free-tier keys in 2026. */
const GEMINI_CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-2.0-flash",
].filter(Boolean) as string[];

export function getVisionModel(): LanguageModel | null {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google(GEMINI_CANDIDATES[0]);
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4o-mini");
  }
  return null;
}

export async function quickVisionText(params: {
  system: string;
  prompt: string;
  imageDataUrl?: string;
}): Promise<string | null> {
  const model = getVisionModel();
  if (!model) return null;

  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  > = [];
  if (params.imageDataUrl) {
    content.push({ type: "image", image: params.imageDataUrl });
  }
  content.push({ type: "text", text: params.prompt });

  const result = await generateText({
    model,
    system: params.system,
    messages: [{ role: "user", content }],
    maxOutputTokens: 400,
  });
  return result.text.trim();
}
