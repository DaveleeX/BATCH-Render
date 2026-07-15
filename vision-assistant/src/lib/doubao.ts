type DoubaoContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

type DoubaoInputMessage = {
  role: "user" | "assistant" | "system";
  content: string | DoubaoContentPart[];
};

type DoubaoResponse = {
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    summary?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string; code?: string };
};

function arkBase() {
  return (
    process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
  ).replace(/\/$/, "");
}

function arkKey() {
  return (
    process.env.ARK_API_KEY ||
    process.env.DOUBAO_API_KEY ||
    process.env.VOLCENGINE_API_KEY ||
    ""
  );
}

export function getDoubaoModelId() {
  return (
    process.env.DOUBAO_MODEL ||
    process.env.ARK_ENDPOINT_ID ||
    process.env.ARK_MODEL ||
    "doubao-seed-2-0-lite-260428"
  );
}

export function canUseDoubao() {
  return Boolean(arkKey() && getDoubaoModelId());
}

function extractText(data: DoubaoResponse): string {
  const parts: string[] = [];
  for (const item of data.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === "output_text" && c.text) parts.push(c.text);
      }
    }
  }
  return parts.join("\n").trim();
}

/**
 * 火山方舟 Responses API（支持图片+文本，国内直连）
 * 文档形态与用户提供的 curl 一致。
 */
export async function doubaoRespond(params: {
  system?: string;
  prompt: string;
  imageDataUrl?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens?: number;
}): Promise<string> {
  const apiKey = arkKey();
  if (!apiKey) throw new Error("missing_ark_api_key");

  const input: DoubaoInputMessage[] = [];

  if (params.system) {
    input.push({ role: "system", content: params.system });
  }

  for (const turn of (params.history || []).slice(-6)) {
    input.push({
      role: turn.role,
      content: [{ type: "input_text", text: turn.content }],
    });
  }

  const userContent: DoubaoContentPart[] = [];
  if (params.imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: params.imageDataUrl,
    });
  }
  userContent.push({ type: "input_text", text: params.prompt });
  input.push({ role: "user", content: userContent });

  const res = await fetch(`${arkBase()}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getDoubaoModelId(),
      input,
      max_output_tokens: params.maxOutputTokens ?? 400,
      // Seed 默认会把额度耗在 reasoning 上，导致正式回复为空
      thinking: { type: "disabled" },
    }),
  });

  const data = (await res.json()) as DoubaoResponse;
  if (!res.ok) {
    throw new Error(
      data.error?.message || `doubao_http_${res.status}`,
    );
  }

  let text = extractText(data);
  if (!text) {
    // 兜底：若仍只有 reasoning summary
    const reasonBits: string[] = [];
    for (const item of data.output || []) {
      if (item.type === "reasoning" && Array.isArray(item.summary)) {
        for (const s of item.summary) {
          if (s.text) reasonBits.push(s.text);
        }
      }
    }
    text = reasonBits.join("\n").trim();
  }
  if (!text) throw new Error("doubao_empty_response");
  return text;
}
