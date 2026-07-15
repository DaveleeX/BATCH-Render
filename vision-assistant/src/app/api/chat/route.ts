import { NextResponse } from "next/server";
import { searchNearbyPois } from "@/lib/amap";
import {
  demoTargetsForFocus,
  detectScreenTargets,
} from "@/lib/detect";
import {
  generateAssistantReply,
  getActiveProvider,
  hasLiveModel,
} from "@/lib/model";
import { matchPeopleInFrame } from "@/lib/people";
import type {
  ChatRequestBody,
  ChatResponseBody,
  PoiResult,
  ScreenTarget,
} from "@/lib/types";

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

async function resolveTargets(params: {
  imageDataUrl?: string;
  text: string;
  shouldTrack: boolean;
}): Promise<ScreenTarget[]> {
  if (!params.shouldTrack || !params.imageDataUrl?.startsWith("data:image")) {
    return [];
  }
  if (!hasLiveModel()) {
    return demoTargetsForFocus(params.text);
  }
  try {
    return await detectScreenTargets({
      imageDataUrl: params.imageDataUrl,
      focus: params.text,
    });
  } catch {
    return demoTargetsForFocus(params.text);
  }
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

  const shouldTrack = Boolean(
    intent.wantTrack || intent.wantWhat || intent.wantWho,
  );

  if (!hasLiveModel()) {
    const targets = await resolveTargets({
      imageDataUrl: body.imageDataUrl,
      text,
      shouldTrack,
    });
    if (targets.length) usedTools.push("screen_track");
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
      targets,
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
    /品牌|什么店|哪家|库迪|瑞幸|星巴克|咖啡|logo|标志|这是什么|看一下/.test(
      text,
    );

  const system = isVisionId
    ? `你是「览界」视觉助手。任务：根据摄像头画面准确识别物体/品牌。
硬规则：
1. 先尽量读出包装、杯套、瓶标上的中英文印刷文字和 logo，再下结论。
2. 不要只凭颜色猜测。红色咖啡纸杯在中国很常见，可能是库迪(Cotti，常见@形标志)、瑞幸、星巴克或其他品牌。
3. 若能看见 Cotti / 库迪 / @ 形标志，优先判为库迪咖啡。
4. 看不清就说「杯套文字看不清，请对准 logo 再拍」，不要硬猜错品牌。
5. 最终只用 1-2 句中文回答，先说品牌名，再说依据（看见了什么字/标志）。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}`
    : `你是「览界」眼镜助手（手机 Demo）。像面对面说话：短、准、不啰嗦。
硬规则：
1. 中文，默认 1-2 句，最多 60 字；附近地点最多列 3 条。
2. 禁止复读用户原话，禁止套话开场。
3. 画面不清楚就说「没看清，对准再问」，不要编造。
4. 人数只有估算时说「大约」。适合语音朗读，少括号少 Markdown。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
附近候选：${poiHint}
已匹配人物：${peopleHint}`;

  const prompt = isVisionId
    ? `${text}

请仔细看图：优先识别杯套/杯身/包装上的品牌文字与 logo，再回答。`
    : text;

  try {
    const targetsPromise = resolveTargets({
      imageDataUrl: body.imageDataUrl,
      text,
      shouldTrack,
    });

    let reply = await generateAssistantReply({
      system,
      text: prompt,
      imageDataUrl: body.imageDataUrl,
      // 品牌识别少带历史，避免被上一句错误答案带偏
      history: isVisionId ? [] : history,
      enableThinking: Boolean(isVisionId && body.imageDataUrl),
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

    const targets = await targetsPromise;
    if (targets.length) usedTools.push("screen_track");

    return NextResponse.json({
      reply,
      pois,
      matchedPeople,
      targets,
      mode: "live",
      usedTools: Array.from(new Set(usedTools)),
      provider: getActiveProvider(),
    } satisfies ChatResponseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "model_error";
    const targets = await resolveTargets({
      imageDataUrl: body.imageDataUrl,
      text,
      shouldTrack,
    }).catch(() => [] as ScreenTarget[]);
    return NextResponse.json({
      reply: demoReply({
        text,
        pois,
        people: matchedPeople,
        geo: body.geo,
      }),
      pois,
      matchedPeople,
      targets,
      mode: "demo",
      usedTools,
      provider: getActiveProvider(),
      error: message,
    } satisfies ChatResponseBody & { error?: string });
  }
}
