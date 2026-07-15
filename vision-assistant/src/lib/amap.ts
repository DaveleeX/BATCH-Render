import type { GeoPoint, MallInfo, PoiResult, ScreenTarget } from "./types";
import { nanoid } from "nanoid";

const AMAP_AROUND = "https://restapi.amap.com/v3/place/around";

type AmapPoi = {
  id: string;
  name: string;
  address?: string;
  distance?: string;
  type?: string;
  location?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  biz_ext?: { rating?: string; cost?: string };
};

function hasUsableKey() {
  const key = process.env.AMAP_WEB_KEY;
  return Boolean(key) && process.env.FORCE_MOCK !== "1";
}

function parseLocation(loc?: string) {
  const [lng, lat] = (loc || "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function mapAmapPoi(p: AmapPoi, source: PoiResult["source"] = "amap"): PoiResult {
  const rating = Number(p.biz_ext?.rating || 0);
  const hotScore = rating ? Math.round(rating * 20) : undefined;
  const crowdCount = rating
    ? Math.max(3, Math.round(rating * 6 + (Number(p.distance) || 30) / 10))
    : undefined;
  const floor = extractFloor(p.address || p.name);

  return {
    id: p.id,
    name: p.name,
    address: p.address,
    distanceMeters: p.distance ? Number(p.distance) : undefined,
    category: p.type?.split(";")[0],
    location: parseLocation(p.location),
    floor,
    hotScore,
    crowdCount,
    crowdLabel: crowdCount
      ? `热度估算约 ${crowdCount} 人（非扫街榜实时值）`
      : undefined,
    source,
  };
}

/** 从地址里尽量抽出楼层，如 B1 / F3 / 3层 */
export function extractFloor(text: string): string | undefined {
  const m =
    text.match(/\b([Bb]\d{1,2})\b/) ||
    text.match(/\b([Ff]\d{1,2})\b/) ||
    text.match(/([地下负]?[一二三四五六七八九十\d]{1,2})\s*[层樓楼]/) ||
    text.match(/(\d{1,2})\s*[Ff]/);
  return m?.[1]?.replace(/\s/g, "");
}

async function amapAround(params: {
  geo: GeoPoint;
  keywords?: string;
  types?: string;
  radiusMeters: number;
  limit: number;
}): Promise<{ pois: AmapPoi[]; info?: string; ok: boolean }> {
  const key = process.env.AMAP_WEB_KEY;
  if (!key) return { pois: [], ok: false, info: "missing_key" };

  const url = new URL(AMAP_AROUND);
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${params.geo.lng},${params.geo.lat}`);
  if (params.keywords) url.searchParams.set("keywords", params.keywords);
  if (params.types) url.searchParams.set("types", params.types);
  url.searchParams.set("radius", String(params.radiusMeters));
  url.searchParams.set("offset", String(params.limit));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");
  url.searchParams.set("sortrule", "distance");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return { pois: [], ok: false, info: `http_${res.status}` };

  const data = (await res.json()) as {
    status: string;
    info?: string;
    pois?: AmapPoi[];
  };
  if (data.status !== "1") {
    return { pois: [], ok: false, info: data.info || "error" };
  }
  return { pois: data.pois || [], ok: true, info: data.info };
}

function demoMall(geo: GeoPoint): MallInfo {
  return {
    id: "demo-mall",
    name: "览界示范购物中心",
    address: "演示地址（配置 Web服务 Key 后显示真实商场）",
    distanceMeters: 35,
    location: { lat: geo.lat, lng: geo.lng },
    source: "demo",
  };
}

function demoBrandPois(geo: GeoPoint, brand: string, mallName: string): PoiResult[] {
  const floors = ["B1", "1F", "2F", "3F"];
  return [0, 1].map((i) => {
    const floor = floors[(brand.length + i) % floors.length];
    const distanceMeters = 28 + i * 40;
    const dLat = (distanceMeters / 111320) * (i === 0 ? 0.2 : -0.15);
    const dLng =
      (distanceMeters / (111320 * Math.cos((geo.lat * Math.PI) / 180))) *
      (i === 0 ? 0.25 : -0.2);
    return {
      id: `demo-brand-${brand}-${i}`,
      name: i === 0 ? `${brand}（${mallName}）` : `${brand}·另一门店`,
      address: `${mallName}${floor}`,
      distanceMeters,
      category: "商场品牌",
      location: { lat: geo.lat + dLat, lng: geo.lng + dLng },
      floor,
      crowdLabel: `${floor} · 约 ${12 + i * 8} 人（演示）`,
      source: "demo" as const,
    };
  });
}

function demoNearbyPois(geo: GeoPoint, keywords: string, radius: number): PoiResult[] {
  const seed = Math.abs(Math.round(geo.lat * 1000 + geo.lng * 1000)) % 7;
  const cafePool = [
    { name: "巷口手冲咖啡", category: "咖啡厅", crowdCount: 18 + seed, hotScore: 92 },
    { name: "南风 Specialty", category: "咖啡厅", crowdCount: 12 + (seed % 5), hotScore: 88 },
    { name: "蓝屋顶咖啡馆", category: "咖啡厅", crowdCount: 7 + (seed % 4), hotScore: 81 },
  ];
  const pool = /娱乐/.test(keywords) 
    ? [
        { name: "河岸 Live House", category: "娱乐场所", crowdCount: 40 + seed, hotScore: 90 },
        { name: "星图剧本杀", category: "娱乐场所", crowdCount: 16 + seed, hotScore: 84 },
      ]
    : cafePool;

  return pool.slice(0, 3).map((item, i) => {
    const distanceMeters = Math.min(radius - 1, 18 + i * 12 + seed);
    return {
      id: `demo-${i}-${item.name}`,
      name: item.name,
      address: `距你约 ${distanceMeters} 米（演示数据）`,
      distanceMeters,
      category: item.category,
      location: {
        lat: geo.lat + (i % 2 === 0 ? 0.0001 : -0.0001),
        lng: geo.lng + (i % 2 === 0 ? -0.00012 : 0.0001),
      },
      crowdCount: item.crowdCount,
      crowdLabel: `约 ${item.crowdCount} 人在店（演示估算）`,
      hotScore: item.hotScore,
      source: "demo" as const,
    };
  });
}

const MALL_TYPES = "060100|060101|060102"; // 购物中心 / 百货 / 综合商场等常见类型码

export async function detectNearbyMall(params: {
  geo: GeoPoint;
  radiusMeters?: number;
}): Promise<{ mall: MallInfo | null; mode: "live" | "demo"; note?: string }> {
  const radius = params.radiusMeters ?? 250;

  if (!hasUsableKey()) {
    return {
      mall: demoMall(params.geo),
      mode: "demo",
      note: "未配置可用 Web服务 Key，返回示范商场。",
    };
  }

  const byType = await amapAround({
    geo: params.geo,
    types: MALL_TYPES,
    keywords: "购物中心",
    radiusMeters: radius,
    limit: 5,
  });

  let hit = byType.pois.find((p) =>
    /购物中心|商场|广场|百货|奥特莱斯|mall/i.test(`${p.name}${p.type || ""}`),
  ) || byType.pois[0];

  if (!hit) {
    const byKw = await amapAround({
      geo: params.geo,
      keywords: "购物中心",
      radiusMeters: radius,
      limit: 5,
    });
    hit =
      byKw.pois.find((p) =>
        /购物中心|商场|广场|百货/i.test(`${p.name}${p.type || ""}`),
      ) || byKw.pois[0];
    if (!byType.ok && !byKw.ok) {
      return {
        mall: demoMall(params.geo),
        mode: "demo",
        note: `高德失败(${byKw.info || byType.info})，降级演示商场。`,
      };
    }
  }

  if (!hit) {
    return { mall: null, mode: "live", note: "附近未检测到商场" };
  }

  const location = parseLocation(hit.location) || {
    lat: params.geo.lat,
    lng: params.geo.lng,
  };

  return {
    mall: {
      id: hit.id,
      name: hit.name,
      address: hit.address,
      distanceMeters: hit.distance ? Number(hit.distance) : undefined,
      location,
      source: "amap",
    },
    mode: "live",
  };
}

export async function searchBrandInMall(params: {
  geo: GeoPoint;
  brand: string;
  mall?: MallInfo | null;
  radiusMeters?: number;
  limit?: number;
}): Promise<{ pois: PoiResult[]; mode: "live" | "demo"; note?: string }> {
  const brand = params.brand.trim();
  const limit = params.limit ?? 5;
  const center = params.mall?.location || params.geo;
  const radius = params.radiusMeters ?? (params.mall ? 180 : 120);
  const mallName = params.mall?.name || "附近商场";

  if (!brand) {
    return { pois: [], mode: "demo", note: "缺少品牌名" };
  }

  if (!hasUsableKey()) {
    return {
      pois: demoBrandPois(center, brand, mallName).slice(0, limit),
      mode: "demo",
      note: "演示：商场内品牌门店位置（需 Web服务 Key 换真数据）",
    };
  }

  // Prefer keyword = brand, bias near mall center
  const result = await amapAround({
    geo: center,
    keywords: brand,
    radiusMeters: radius,
    limit: Math.max(limit, 8),
  });

  if (!result.ok) {
    return {
      pois: demoBrandPois(center, brand, mallName).slice(0, limit),
      mode: "demo",
      note: `高德品牌搜索失败(${result.info})，降级演示。`,
    };
  }

  const filtered = result.pois
    .filter((p) => {
      const blob = `${p.name}${p.address || ""}`;
      // keep same brand or share mall name in address
      return (
        blob.includes(brand) ||
        (params.mall?.name ? blob.includes(params.mall.name.slice(0, 4)) : true)
      );
    })
    .map((p) => {
      const mapped = mapAmapPoi(p, "amap");
      if (!mapped.floor && params.mall) {
        mapped.floor = extractFloor(mapped.address || "") || undefined;
      }
      return mapped;
    });

  const pois = (filtered.length ? filtered : result.pois.map((p) => mapAmapPoi(p))).slice(
    0,
    limit,
  );

  if (!pois.length) {
    return {
      pois: demoBrandPois(center, brand, mallName).slice(0, limit),
      mode: "demo",
      note: "该商场周边未搜到品牌，返回演示门店。",
    };
  }

  return {
    pois,
    mode: "live",
    note: params.mall
      ? `已在「${params.mall.name}」周边检索「${brand}」`
      : `已检索附近「${brand}」`,
  };
}

export async function searchNearbyPois(params: {
  geo: GeoPoint;
  keywords: string;
  radiusMeters?: number;
  limit?: number;
}): Promise<{ pois: PoiResult[]; mode: "live" | "demo"; note?: string }> {
  const radius = params.radiusMeters ?? 50;
  const limit = params.limit ?? 5;

  if (!hasUsableKey()) {
    return {
      pois: demoNearbyPois(params.geo, params.keywords, radius).slice(0, limit),
      mode: "demo",
      note: "未配置 AMAP_WEB_KEY，返回演示 POI。",
    };
  }

  const result = await amapAround({
    geo: params.geo,
    keywords: params.keywords || "咖啡",
    radiusMeters: radius,
    limit,
  });

  if (!result.ok || !result.pois.length) {
    return {
      pois: demoNearbyPois(params.geo, params.keywords, radius).slice(0, limit),
      mode: "demo",
      note: `高德无结果(${result.info || "empty"})，已降级演示数据。`,
    };
  }

  return {
    pois: result.pois.map((p) => mapAmapPoi(p, "scanstreet-adapter")).slice(0, limit),
    mode: "live",
    note: "已使用高德周边搜索。",
  };
}

/** 常见品牌 + 句式抽取 */
export function extractBrandQuery(text: string): string | null {
  const brands = [
    "星巴克",
    "瑞幸",
    "库迪",
    "喜茶",
    "奈雪",
    "霸王茶姬",
    "优衣库",
    "无印良品",
    "MUJI",
    "ZARA",
    "H&M",
    "Apple",
    "苹果",
    "华为",
    "小米",
    "海底捞",
    "西西弗",
    "方所",
    "迪卡侬",
    "耐克",
    "Nike",
    "阿迪达斯",
    "Adidas",
    "泡泡玛特",
    "名创优品",
    "屈臣氏",
    "盒子餐厅",
    "肯德基",
    "麦当劳",
    "必胜客",
  ];
  for (const b of brands) {
    if (new RegExp(b, "i").test(text)) return b === "Apple" || b === "苹果" ? "苹果" : b;
  }

  const m = text.match(
    /(?:找一下|找下|寻找|帮我找|去|到|请问)?\s*([A-Za-z0-9·&\u4e00-\u9fa5]{2,12}?)\s*(?:在哪|在哪儿|在哪里|在几楼|在几层|在哪层|怎么走|位置|有没有)/,
  );
  if (m?.[1] && !/这是|那里|这边|商场|购物|厕所|电梯/.test(m[1])) {
    return m[1];
  }
  return null;
}

/** Spread brand pins across the viewfinder as a mall-directory cue */
export function brandPoisToTargets(
  pois: Array<{ id: string; name: string; floor?: string }>,
): ScreenTarget[] {
  const n = Math.min(pois.length, 4);
  if (!n) return [];
  return pois.slice(0, n).map((p, i) => {
    const t = n === 1 ? 0.5 : 0.22 + (i / Math.max(1, n - 1)) * 0.56;
    return {
      id: p.id || nanoid(8),
      label: p.floor ? `${p.name.replace(/（.*?）/g, "").slice(0, 10)} · ${p.floor}` : p.name.slice(0, 14),
      cx: t,
      cy: 0.4 + (i % 2) * 0.1,
      w: 0.18,
      h: 0.14,
      confidence: 0.72,
    };
  });
}
