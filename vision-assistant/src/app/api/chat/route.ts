import { NextResponse } from "next/server";
import {
  brandPoisToTargets,
  extractBrandQuery,
  searchBrandInMall,
  searchNearbyPois,
} from "@/lib/amap";
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
export const maxDuration = 30;

function detectIntent(text: string) {
  const brand = extractBrandQuery(text);
  const wantBrand =
    Boolean(brand) &&
    /在哪|在哪儿|在哪里|在几楼|在几层|在哪层|怎么走|位置|有没有|找/.test(text);
  return {
    brand,
    wantBrand,
    wantNearby:
      !wantBrand &&
      (/附近|周边|周围|推荐|找一家|有没有.*(咖啡|餐厅|娱乐|酒吧|景点)|附近.*(咖啡|店|玩)/.test(
        text,
      ) ||
        /^(咖啡|咖啡馆|餐厅|娱乐)$/.test(text.trim())),
    wantWho: /这是谁|他是谁|她是谁|人脸|这人是|认识他|认识她|身份是谁/.test(text),
    wantWhat: /这是什么|什么东西|识别|看一下|这是啥|前面是什么|路上是什么|手办|什么玩意|拍到的是/.test(
      text,
    ),
    wantWhere: /这是哪里|什么地方|在哪|定位|地址/.test(text) && !wantBrand,
    wantTrack:
      /这是什么|什么东西|识别|看一下|这是啥|手办|杯子|品牌|logo|这是谁|他是谁|她是谁|前面是什么|拍到|对准/.test(
        text,
      ),
  };
}

function brandReply(brand: string, mallName: string | undefined, pois: PoiResult[]) {
  if (!pois.length) {
    return mallName
      ? `在「${mallName}」附近还没搜到${brand}，换个品牌再问我。`
      : `附近还没搜到${brand}。`;
  }
  const top = pois[0];
  const floorBit = top.floor ? `${top.floor}` : "";
  const dist =
    top.distanceMeters != null ? `约 ${top.distanceMeters} 米` : "";
  const where = [floorBit, dist].filter(Boolean).join(" · ");
  if (mallName) {
    return where
      ? `${brand}在「${mallName}」${where}。`
      : `${brand}在「${mallName}」内，已在画面标出。`;
  }
  return where ? `${brand}：${where}。` : `已为你标出附近的${brand}。`;
}

function demoReply(params: {
  text: string;
  pois: PoiResult[];
  people: ChatResponseBody["matchedPeople"];
  geo?: ChatRequestBody["geo"];
  brand?: string | null;
  mallName?: string;
}): string {
  const intent = detectIntent(params.text);
  if (params.people?.length) {
    const p = params.people[0];
    return `${p.displayName}${p.occupation ? `，${p.occupation}` : ""}。${p.bio || "对方已公开可发现身份。"}`;
  }
  if ((intent.wantBrand || params.brand) && params.pois.length) {
    return brandReply(
      params.brand || intent.brand || "该品牌",
      params.mallName,
      params.pois,
    );
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
  return "我在。对准商场可问「星巴克在哪」「优衣库在几楼」。";
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
  let brandTargets: ScreenTarget[] = [];
  const mallName = body.mall?.name;

  const sideJobs: Promise<void>[] = [];

  if (intent.wantBrand && intent.brand && body.geo) {
    sideJobs.push(
      (async () => {
        const found = await searchBrandInMall({
          geo: body.geo!,
          brand: intent.brand!,
          mall: body.mall || null,
          limit: 5,
        });
        pois = found.pois;
        brandTargets = brandPoisToTargets(found.pois);
        usedTools.push("amap_brand_in_mall");
      })(),
    );
  } else if (intent.wantNearby && body.geo) {
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

  const basePayload = {
    pois,
    matchedPeople,
    mall: body.mall || null,
    brand: intent.brand,
    brandTargets: brandTargets.length ? brandTargets : undefined,
    needTrack: Boolean(
      !intent.wantBrand &&
        (intent.wantTrack || intent.wantWhat || intent.wantWho),
    ),
    usedTools: Array.from(new Set(usedTools)),
    provider: getActiveProvider(),
  };

  // Brand questions: prefer fast factual reply without waiting on vision LLM
  if (intent.wantBrand && intent.brand) {
    const reply = brandReply(intent.brand, mallName, pois);
    return NextResponse.json({
      reply,
      ...basePayload,
      mode: pois[0]?.source === "demo" ? "demo" : "live",
    } satisfies ChatResponseBody);
  }

  if (!hasLiveModel()) {
    const reply = demoReply({
      text,
      pois,
      people: matchedPeople,
      geo: body.geo,
      brand: intent.brand,
      mallName,
    });
    return NextResponse.json({
      reply,
      ...basePayload,
      mode: "demo",
    } satisfies ChatResponseBody);
  }

  const history = (body.history || []).slice(-4);
  const poiHint = pois.length
    ? pois
        .slice(0, 3)
        .map(
          (p) =>
            `${p.name}${p.floor ? ` ${p.floor}` : ""}${p.distanceMeters != null ? ` ${p.distanceMeters}米` : ""}`,
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
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
商场：${mallName || "未知"}`
    : `你是「览界」眼镜助手。短、准、中文 1 句，最多 40 字。禁止复读用户。
地理：${body.geo ? `${body.geo.lat.toFixed(5)}, ${body.geo.lng.toFixed(5)}` : "未知"}
商场：${mallName || "未知"}
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
        brand: intent.brand,
        mallName,
      });
    }

    return NextResponse.json({
      reply,
      ...basePayload,
      mode: "live",
    } satisfies ChatResponseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "model_error";
    return NextResponse.json({
      reply: demoReply({
        text,
        pois,
        people: matchedPeople,
        geo: body.geo,
        brand: intent.brand,
        mallName,
      }),
      ...basePayload,
      mode: "demo",
      error: message,
    } satisfies ChatResponseBody & { error?: string });
  }
}
