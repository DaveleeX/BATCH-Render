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
export const maxDuration = 60;

function detectIntent(text: string) {
  const t = text.toLowerCase();
  return {
    wantNearby:
      /附近|周边|周围|推荐|找一家|有没有.*(咖啡|餐厅|娱乐|酒吧|景点)|附近.*(咖啡|店|玩)/.test(
        t,
      ) || /^(咖啡|咖啡馆|餐厅|娱乐)$/.test(t.trim()),
    wantWho: /这是谁|他是谁|她是谁|人脸|这人是|认识他|认识她|身份是谁/.test(t),
    wantWhat: /这是什么|什么东西|识别|看一下|这是啥|前面是什么|路上是什么/.test(
      t,
    ),
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
      matchedPeople = [];
    }
  }

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
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
    } satisfies ChatResponseBody);
  }

  const history = (body.history || []).slice(-6);
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

  const system = `你是「览界」眼镜助手（手机 Demo）。像面对面说话：短、准、不啰嗦。
硬规则：
1. 中文，默认 1-2 句，最多 60 字；附近地点最多列 3 条。
2. 禁止复读用户原话，禁止套话开场。
3. 画面不清楚就说「没看清，对准再问」，不要编造。
4. 人数只有估算时说「大约」。适合语音朗读，少括号少 Markdown。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
附近候选：${poiHint}
已匹配人物：${peopleHint}`;

  try {
    let reply = await generateAssistantReply({
      system,
      text,
      imageDataUrl: body.imageDataUrl,
      history,
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
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
      error: message,
    } satisfies ChatResponseBody & { error?: string });
  }
}
