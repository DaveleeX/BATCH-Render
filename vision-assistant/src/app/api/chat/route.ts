import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { searchNearbyPois } from "@/lib/amap";
import { getActiveProvider, getVisionModel, hasLiveModel } from "@/lib/model";
import { matchPeopleInFrame } from "@/lib/people";
import type { ChatRequestBody, ChatResponseBody, PoiResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function detectIntent(text: string) {
  const t = text.toLowerCase();
  return {
    wantNearby:
      /附近|周边|周围|推荐|找一家|有没有.*(咖啡|餐厅|娱乐|酒吧|景点)|附近.*(咖啡|店|玩)/.test(
        t,
      ) || /^(咖啡|咖啡馆|餐厅|娱乐)$/.test(t.trim()),
    wantWho: /这是谁|他是谁|她是谁|人脸|这人是|认识他|认识她|身份是谁/.test(t),
    wantWhat: /这是什么|什么东西|识别|看一下|这是啥|前面是什么|路上是什么/.test(t),
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
    usedTools.push("amap_nearby");
  }

  if (intent.wantWho || /这是谁|人脸/.test(text)) {
    try {
      matchedPeople = await matchPeopleInFrame({
        imageDataUrl: body.imageDataUrl,
        text,
      });
      usedTools.push("people_match");
    } catch {
      // 身份库读写失败时不阻断主对话
      matchedPeople = [];
    }
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
      reply,
      pois,
      matchedPeople,
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
    };
    return NextResponse.json(payload);
  }

  const history = (body.history || []).slice(-6);
  const collectedPois: PoiResult[] = [...pois];
  const collectedPeople = [...(matchedPeople || [])];

  const system = `你是「览界」眼镜助手（手机 Demo）。像面对面说话：短、准、不啰嗦。
硬规则：
1. 中文回复，默认 1-2 句，最多 60 字；列 POI 时最多 3 条短列表。
2. 禁止复读用户原话，禁止重复上一轮相同句式或固定开场白。
3. 不要输出「我是 AI」「作为助手」等套话；直接给答案。
4. 画面不清楚就说「没看清，对准再问」，不要编造。
5. 问附近地点时用 search_nearby；问「这是谁」用 match_people。
6. 人数只有估算时说「大约」；不要贴长说明/免责声明。
7. 回答要适合语音朗读：少括号、少 Markdown。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
预取POI：${collectedPois.length ? collectedPois.slice(0, 3).map((p) => p.name).join("、") : "无"}
预取人物：${collectedPeople.length ? collectedPeople.map((p) => p.displayName).join("、") : "无"}`;

  try {
    const result = await generateText({
      model,
      system,
      temperature: 0.4,
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
      maxOutputTokens: 220,
    });

    let reply =
      result.text.trim() ||
      demoReply({
        text,
        pois: collectedPois,
        people: collectedPeople,
        geo: body.geo,
      });

    // 去掉模型爱重复的括号备注
    reply = reply.replace(/（[^）]*演示[^）]*）/g, "").trim();

    const payload: ChatResponseBody = {
      reply,
      pois: collectedPois,
      matchedPeople: collectedPeople,
      mode: "live",
      usedTools: Array.from(new Set(usedTools)),
      provider: getActiveProvider(),
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
      reply,
      pois: collectedPois,
      matchedPeople: collectedPeople,
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
      error: message,
    } satisfies ChatResponseBody & { error?: string });
  }
}
