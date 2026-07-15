import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

export type AiProvider = "qwen" | "doubao" | "gemini" | "openai";

type ResolvedModel = {
  provider: AiProvider;
  modelId: string;
  model: LanguageModel;
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
    // 视觉对话使用 chat 兼容接口
    model: client.chat(modelId),
  };
}

function resolveDoubao(): ResolvedModel | null {
  const apiKey =
    process.env.ARK_API_KEY ||
    process.env.DOUBAO_API_KEY ||
    process.env.VOLCENGINE_API_KEY;
  if (!apiKey) return null;

  const baseURL =
    process.env.ARK_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";

  // 火山方舟需「已开通」的模型名，或控制台创建的接入点 ID（ep-xxxx）
  const modelId =
    process.env.DOUBAO_MODEL ||
    process.env.ARK_ENDPOINT_ID ||
    process.env.ARK_MODEL;
  if (!modelId) return null;

  const client = createOpenAI({
    apiKey,
    baseURL,
    name: "doubao",
  });

  return {
    provider: "doubao",
    modelId,
    model: client.chat(modelId),
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
  return Boolean(resolveDoubao());
}

function resolveGemini(): ResolvedModel | null {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  const modelId =
    process.env.GEMINI_MODEL ||
    "gemini-3.1-flash-lite";
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

  // 国内优先：通义 > 豆包 > Gemini > OpenAI
  return (
    resolveQwen() ||
    resolveDoubao() ||
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
