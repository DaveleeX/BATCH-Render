import { NextResponse } from "next/server";
import { searchNearbyPois } from "@/lib/amap";
import {
  generateAssistantReply,
  getActiveProvider,
  hasLiveModel,
} from "@/lib/model";
import { matchPeopleInFrame } from "@/lib/people";
import type { ChatRequestBody, ChatResponseBody, PoiResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function detectIntent(text: string) {
  const t = text.toLowerCase();
  return {
    wantNearby:
      /附近|周边|周围|推荐|找一家|有没有.*(咖啡|餐厅|娱乐|酒吧|景点)|附近.*(咖啡|店|玩)/.test(
        t,
      ) || /^(咖啡|咖啡馆|餐厅|娱乐)$/.test(t.trim()),
    wantWho: /这是谁|他是谁|她是谁|人脸|这人是|认识他|认识她|身份是谁/.test(t),
    wantWhat: /这是什么|什么东西|识别|看一下|这是啥|前面是什么|路上是什么|手办|什么玩意|拍到的是/.test(
      t,
    ),
    wantWhere: /这是哪里|什么地方|在哪|定位|地址/.test(t),
    wantTrack:
      /这是什么|什么东西|识别|看一下|这是啥|手办|杯子|品牌|logo|这是谁|他是谁|她是谁|前面是什么|拍到|对准/.test(
        t,
      ),
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
    return `当前位置约 ${params.geo.lat.toFixed(5)}, ${params.geo.lng.toFixed(5)}。`;
  }
  if (intent.wantWhat) {
    return "已收到画面。配置豆包/千问后可直接告诉你这是什么。";
  }
  return "我在。你可以问：这是什么、这是谁、附近有什么热门咖啡馆。";
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

  // Parallelize side tools so reply path is not strictly serial
  const sideJobs: Promise<void>[] = [];

  if (intent.wantNearby && body.geo) {
    sideJobs.push(
      (async () => {
        const keywordMatch = text.match(
          /(网红)?(热门)?(.{0,8}?)(咖啡|咖啡馆|餐厅|娱乐|酒吧|景点)/,
        );
        const keywords = keywordMatch
          ? `${keywordMatch[3] || ""}${keywordMatch[4]}`.trim() || "咖啡"
          : /娱乐/.test(text)
            ? "娱乐"
            : "咖啡";
        const nearby = await searchNearbyPois({
          geo: body.geo!,
          keywords,
          radiusMeters: 50,
          limit: 5,
        });
        pois = nearby.pois;
        usedTools.push("amap_nearby");
      })(),
    );
  }

  // Who-match is a second model call — only when clearly needed
  if (intent.wantWho) {
    sideJobs.push(
      (async () => {
        try {
          matchedPeople = await matchPeopleInFrame({
            imageDataUrl: body.imageDataUrl,
            text,
          });
          usedTools.push("people_match");
        } catch {
          matchedPeople = [];
        }
      })(),
    );
  }

  await Promise.all(sideJobs);

  if (!hasLiveModel()) {
    const reply = demoReply({
      text,
      pois,
      people: matchedPeople,
      geo: body.geo,
    });
    return NextResponse.json({
      reply,
      pois,
      matchedPeople,
      // client handles tracking via /api/detect in parallel
      needTrack: Boolean(intent.wantTrack || intent.wantWhat || intent.wantWho),
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
    } satisfies ChatResponseBody);
  }

  const history = (body.history || []).slice(-4);
  const poiHint = pois.length
    ? pois
        .slice(0, 3)
        .map(
          (p) =>
            `${p.name}${p.distanceMeters != null ? ` ${p.distanceMeters}米` : ""}${p.crowdLabel ? ` ${p.crowdLabel}` : ""}`,
        )
        .join("；")
    : "无";
  const peopleHint = matchedPeople?.length
    ? matchedPeople
        .map((p) => `${p.displayName}${p.occupation ? `/${p.occupation}` : ""}`)
        .join("；")
    : "无";

  const isVisionId =
    intent.wantWhat ||
    /品牌|什么店|哪家|库迪|瑞幸|星巴克|咖啡|logo|标志|这是什么|看一下|手办/.test(
      text,
    );

  const system = isVisionId
    ? `你是「览界」视觉助手。根据画面快速识别。
规则：读清文字/logo 再下结论；看不清就直说；只回 1 句中文，不超过 40 字。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}`
    : `你是「览界」眼镜助手。短、准、中文 1 句，最多 40 字。禁止复读用户。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
附近：${poiHint}
人物：${peopleHint}`;

  const prompt = isVisionId
    ? `${text}\n看图后一句回答，先说名称。`
    : text;

  try {
    let reply = await generateAssistantReply({
      system,
      text: prompt,
      imageDataUrl: body.imageDataUrl,
      history: isVisionId ? [] : history,
      enableThinking: false,
      maxOutputTokens: 120,
    });
    reply = reply.replace(/（[^）]*演示[^）]*）/g, "").trim();
    if (!reply) {
      reply = demoReply({
        text,
        pois,
        people: matchedPeople,
        geo: body.geo,
      });
    }

    return NextResponse.json({
      reply,
      pois,
      matchedPeople,
      needTrack: Boolean(intent.wantTrack || intent.wantWhat || intent.wantWho),
      mode: "live",
      usedTools: Array.from(new Set(usedTools)),
      provider: getActiveProvider(),
    } satisfies ChatResponseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "model_error";
    return NextResponse.json({
      reply: demoReply({
        text,
        pois,
        people: matchedPeople,
        geo: body.geo,
      }),
      pois,
      matchedPeople,
      needTrack: Boolean(intent.wantTrack || intent.wantWhat || intent.wantWho),
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
      error: message,
    } satisfies ChatResponseBody & { error?: string });
  }
}
