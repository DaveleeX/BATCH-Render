import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import {
  canUseDoubao,
  doubaoRespond,
  getDoubaoModelId,
} from "./doubao";

export type AiProvider = "qwen" | "doubao" | "gemini" | "openai";

type ResolvedModel = {
  provider: AiProvider;
  modelId: string;
  model: LanguageModel | null;
};

function preferredProvider(): AiProvider | null {
  const raw = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (raw === "qwen" || raw === "qianwen" || raw === "dashscope") return "qwen";
  if (raw === "doubao" || raw === "ark" || raw === "volcengine") return "doubao";
  if (raw === "gemini" || raw === "google") return "gemini";
  if (raw === "openai") return "openai";
  return null;
}

function resolveQwen(): ResolvedModel | null {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  if (!apiKey) return null;

  const baseURL =
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const modelId =
    process.env.QWEN_MODEL ||
    process.env.DASHSCOPE_MODEL ||
    "qwen-vl-plus";

  const client = createOpenAI({
    apiKey,
    baseURL,
    name: "qwen",
  });

  return {
    provider: "qwen",
    modelId,
    model: client.chat(modelId),
  };
}

function resolveDoubao(): ResolvedModel | null {
  if (!canUseDoubao()) return null;
  // 豆包走专用 Responses API；这里仍返回占位，供 provider 识别
  return {
    provider: "doubao",
    modelId: getDoubaoModelId(),
    model: null,
  };
}

export function doubaoKeyPresent(): boolean {
  return Boolean(
    process.env.ARK_API_KEY ||
      process.env.DOUBAO_API_KEY ||
      process.env.VOLCENGINE_API_KEY,
  );
}

export function doubaoReady(): boolean {
  return canUseDoubao();
}

function resolveGemini(): ResolvedModel | null {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  const modelId = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  return {
    provider: "gemini",
    modelId,
    model: google(modelId),
  };
}

function resolveOpenAI(): ResolvedModel | null {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return {
    provider: "openai",
    modelId,
    model: openai(modelId),
  };
}

export function resolveVisionModel(): ResolvedModel | null {
  const preferred = preferredProvider();
  const resolvers: Record<AiProvider, () => ResolvedModel | null> = {
    qwen: resolveQwen,
    doubao: resolveDoubao,
    gemini: resolveGemini,
    openai: resolveOpenAI,
  };

  if (preferred) {
    const hit = resolvers[preferred]();
    if (hit) return hit;
  }

  // 国内优先：豆包 > 通义 > Gemini > OpenAI
  return (
    resolveDoubao() ||
    resolveQwen() ||
    resolveGemini() ||
    resolveOpenAI() ||
    null
  );
}

export function hasLiveModel(): boolean {
  return Boolean(resolveVisionModel());
}

export function getActiveProvider(): AiProvider | "demo" {
  return resolveVisionModel()?.provider || "demo";
}

export function getVisionModel(): LanguageModel | null {
  return resolveVisionModel()?.model || null;
}

export async function quickVisionText(params: {
  system: string;
  prompt: string;
  imageDataUrl?: string;
}): Promise<string | null> {
  const resolved = resolveVisionModel();
  if (!resolved) return null;

  if (resolved.provider === "doubao") {
    return doubaoRespond({
      system: params.system,
      prompt: params.prompt,
      imageDataUrl: params.imageDataUrl,
      maxOutputTokens: 400,
    });
  }

  const model = resolved.model;
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

export async function generateAssistantReply(params: {
  system: string;
  text: string;
  imageDataUrl?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const resolved = resolveVisionModel();
  if (!resolved) throw new Error("no_model");

  if (resolved.provider === "doubao") {
    return doubaoRespond({
      system: params.system,
      prompt: params.text,
      imageDataUrl: params.imageDataUrl,
      history: params.history,
      maxOutputTokens: 320,
    });
  }

  const model = resolved.model;
  if (!model) throw new Error("no_model");

  const result = await generateText({
    model,
    system: params.system,
    temperature: 0.4,
    messages: [
      ...(params.history || []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user" as const,
        content: [
          ...(params.imageDataUrl
            ? ([{ type: "image" as const, image: params.imageDataUrl }] as const)
            : []),
          { type: "text" as const, text: params.text },
        ],
      },
    ],
    maxOutputTokens: 220,
  });
  return result.text.trim();
}
