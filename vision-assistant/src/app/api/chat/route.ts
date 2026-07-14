import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { searchNearbyPois } from "@/lib/amap";
import { getVisionModel, hasLiveModel } from "@/lib/model";
import { matchPeopleInFrame } from "@/lib/people";
import type { ChatRequestBody, ChatResponseBody, PoiResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function detectIntent(text: string) {
  const t = text.toLowerCase();
  return {
    wantNearby:
      /附近|周边|哪儿|哪里|咖啡|娱乐|网红|热门|餐厅|吃饭|玩|店/.test(t),
    wantWho: /谁|人脸|这人|他是|她是|认识|身份|职业/.test(t),
    wantWhat: /这是什么|什么东西|识别|看一下|这是啥/.test(t),
    wantWhere: /这是哪里|什么地方|在哪|定位|地址/.test(t),
  };
}

function demoReply(params: {
  text: string;
  pois: PoiResult[];
  people: ChatResponseBody["matchedPeople"];
  geo?: ChatRequestBody["geo"];
}): string {
  const intent = detectIntent(params.text);
  if (params.people?.length) {
    const p = params.people[0];
    return `${p.displayName}${p.occupation ? `，${p.occupation}` : ""}。${p.bio || "对方已公开可发现身份。"}`;
  }
  if (intent.wantNearby && params.pois.length) {
    const lines = params.pois
      .map(
        (p, i) =>
          `${i + 1}. ${p.name}（${p.distanceMeters ?? "?"}米）${p.crowdLabel ? ` · ${p.crowdLabel}` : ""}`,
      )
      .join("\n");
    return `50 米内推荐：\n${lines}`;
  }
  if (intent.wantWhere && params.geo) {
    return `当前位置约 ${params.geo.lat.toFixed(5)}, ${params.geo.lng.toFixed(5)}。配置 AI Key 后可结合画面说明更具体的地点。`;
  }
  if (intent.wantWhat) {
    return "演示模式：已收到画面。配置 GOOGLE_GENERATIVE_AI_API_KEY 或 OPENAI_API_KEY 后，我可以直接告诉你画面里是什么。";
  }
  return "我在。你可以问：这是什么、这是谁、附近有什么热门咖啡馆。当前为演示模式。";
}

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "empty text" }, { status: 400 });
  }

  const intent = detectIntent(text);
  const usedTools: string[] = [];
  let pois: PoiResult[] = [];
  let matchedPeople: ChatResponseBody["matchedPeople"] = [];
  let amapNote: string | undefined;

  if (intent.wantNearby && body.geo) {
    const keywordMatch = text.match(
      /(网红)?(热门)?(.{0,8}?)(咖啡|咖啡馆|餐厅|娱乐|酒吧|景点)/,
    );
    const keywords = keywordMatch
      ? `${keywordMatch[3] || ""}${keywordMatch[4]}`.trim() || "咖啡"
      : /娱乐/.test(text)
        ? "娱乐"
        : "咖啡";
    const nearby = await searchNearbyPois({
      geo: body.geo,
      keywords,
      radiusMeters: 50,
      limit: 5,
    });
    pois = nearby.pois;
    amapNote = nearby.note;
    usedTools.push("amap_nearby");
  }

  if (intent.wantWho || /认识|身份/.test(text)) {
    matchedPeople = await matchPeopleInFrame({
      imageDataUrl: body.imageDataUrl,
      text,
    });
    usedTools.push("people_match");
  }

  const model = getVisionModel();
  if (!model || !hasLiveModel()) {
    const reply = demoReply({
      text,
      pois,
      people: matchedPeople,
      geo: body.geo,
    });
    const payload: ChatResponseBody = {
      reply: amapNote ? `${reply}\n\n（${amapNote}）` : reply,
      pois,
      matchedPeople,
      mode: "demo",
      usedTools,
    };
    return NextResponse.json(payload);
  }

  const history = (body.history || []).slice(-8);
  const collectedPois: PoiResult[] = [...pois];
  const collectedPeople = [...(matchedPeople || [])];

  const system = `你是「览界」智能眼镜助手的手机 Demo。风格：简洁、口语、快速，像豆包语音助手。
硬规则：
1. 默认中文回复，尽量不超过 80 字；列举 POI 时可用短列表。
2. 你会收到用户当前摄像头画面、地理位置、历史对话。
3. 问附近店铺/娱乐时，优先调用工具 search_nearby；半径默认 50 米。
4. 问「这是谁」时调用 match_people；仅返回对方主动公开的信息。
5. 不要编造精确实时店内人数；若只有估算，要说「估算」。
6. 为后续眼镜移植预留：回答可被语音直接朗读。
当前已知地理：${body.geo ? `${body.geo.lat}, ${body.geo.lng}` : "未知"}
已预取 POI：${JSON.stringify(collectedPois.slice(0, 5))}
已预取人物：${JSON.stringify(collectedPeople)}
${amapNote ? `数据说明：${amapNote}` : ""}`;

  try {
    const result = await generateText({
      model,
      system,
      messages: [
        ...history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        {
          role: "user",
          content: [
            ...(body.imageDataUrl
              ? ([{ type: "image" as const, image: body.imageDataUrl }] as const)
              : []),
            { type: "text" as const, text },
          ],
        },
      ],
      tools: {
        search_nearby: tool({
          description: "基于高德周边搜索推荐附近地点（含扫街榜适配层热度）",
          inputSchema: z.object({
            keywords: z.string().default("咖啡"),
            radiusMeters: z.number().min(20).max(2000).default(50),
          }),
          execute: async ({ keywords, radiusMeters }) => {
            usedTools.push("amap_nearby_tool");
            if (!body.geo) return { error: "no_geo", pois: [] };
            const r = await searchNearbyPois({
              geo: body.geo,
              keywords,
              radiusMeters,
              limit: 5,
            });
            collectedPois.splice(0, collectedPois.length, ...r.pois);
            return r;
          },
        }),
        match_people: tool({
          description: "匹配画面中已选择公开的人物身份",
          inputSchema: z.object({}),
          execute: async () => {
            usedTools.push("people_match_tool");
            const matches = await matchPeopleInFrame({
              imageDataUrl: body.imageDataUrl,
              text,
            });
            collectedPeople.splice(0, collectedPeople.length, ...matches);
            return { matches };
          },
        }),
      },
      stopWhen: stepCountIs(3),
      maxOutputTokens: 500,
    });

    const payload: ChatResponseBody = {
      reply: result.text.trim() || demoReply({
        text,
        pois: collectedPois,
        people: collectedPeople,
        geo: body.geo,
      }),
      pois: collectedPois,
      matchedPeople: collectedPeople,
      mode: "live",
      usedTools: Array.from(new Set(usedTools)),
    };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "model_error";
    const reply = demoReply({
      text,
      pois: collectedPois,
      people: collectedPeople,
      geo: body.geo,
    });
    return NextResponse.json({
      reply: `${reply}\n\n（模型调用失败：${message}）`,
      pois: collectedPois,
      matchedPeople: collectedPeople,
      mode: "demo",
      usedTools,
    } satisfies ChatResponseBody);
  }
}
