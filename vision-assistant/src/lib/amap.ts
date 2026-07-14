import type { GeoPoint, PoiResult } from "./types";

const AMAP_AROUND = "https://restapi.amap.com/v3/place/around";

type AmapPoi = {
  id: string;
  name: string;
  address?: string;
  distance?: string;
  type?: string;
  location?: string;
  biz_ext?: { rating?: string; cost?: string };
};

function demoPois(geo: GeoPoint, keywords: string, radius: number): PoiResult[] {
  const seed = Math.abs(Math.round(geo.lat * 1000 + geo.lng * 1000)) % 7;
  const cafePool = [
    {
      name: "巷口手冲咖啡",
      category: "咖啡厅",
      crowdCount: 18 + seed,
      hotScore: 92,
    },
    {
      name: "南风 Specialty",
      category: "咖啡厅",
      crowdCount: 12 + (seed % 5),
      hotScore: 88,
    },
    {
      name: "蓝屋顶咖啡馆",
      category: "咖啡厅",
      crowdCount: 7 + (seed % 4),
      hotScore: 81,
    },
    {
      name: "夜行者 Espresso",
      category: "咖啡厅",
      crowdCount: 22 + seed,
      hotScore: 95,
    },
  ];
  const funPool = [
    {
      name: "河岸 Live House",
      category: "娱乐场所",
      crowdCount: 40 + seed,
      hotScore: 90,
    },
    {
      name: "星图剧本杀",
      category: "娱乐场所",
      crowdCount: 16 + seed,
      hotScore: 84,
    },
    {
      name: "慢热桌球吧",
      category: "娱乐场所",
      crowdCount: 11 + seed,
      hotScore: 79,
    },
  ];

  const wantCafe = /咖啡|cafe|网红|热门/.test(keywords.toLowerCase());
  const pool = wantCafe ? cafePool : [...cafePool.slice(0, 2), ...funPool];

  return pool.slice(0, 3).map((item, i) => {
    const distanceMeters = Math.min(radius - 1, 18 + i * 12 + seed);
    const dLat = (distanceMeters / 111320) * (i % 2 === 0 ? 1 : -1) * 0.3;
    const dLng =
      (distanceMeters / (111320 * Math.cos((geo.lat * Math.PI) / 180))) *
      (i % 2 === 0 ? -1 : 1) *
      0.4;
    return {
      id: `demo-${i}-${item.name}`,
      name: item.name,
      address: `距你约 ${distanceMeters} 米（演示数据）`,
      distanceMeters,
      category: item.category,
      location: { lat: geo.lat + dLat, lng: geo.lng + dLng },
      crowdCount: item.crowdCount,
      crowdLabel: `约 ${item.crowdCount} 人在店（演示估算）`,
      hotScore: item.hotScore,
      source: "demo" as const,
    };
  });
}

function mapAmapPoi(p: AmapPoi): PoiResult {
  const [lng, lat] = (p.location || "").split(",").map(Number);
  const rating = Number(p.biz_ext?.rating || 0);
  // 公开接口目前没有扫街榜「店内实时人数」。这里用评分衍生可感知热度提示，
  // 并保留 adapter 字段，方便以后接上官方扫街榜/旺铺数据源。
  const hotScore = rating ? Math.round(rating * 20) : undefined;
  const crowdCount = rating
    ? Math.max(3, Math.round(rating * 6 + (Number(p.distance) || 30) / 10))
    : undefined;

  return {
    id: p.id,
    name: p.name,
    address: p.address,
    distanceMeters: p.distance ? Number(p.distance) : undefined,
    category: p.type?.split(";")[0],
    location:
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    hotScore,
    crowdCount,
    crowdLabel: crowdCount
      ? `热度估算约 ${crowdCount} 人（非扫街榜实时值）`
      : "暂无实时人数（扫街榜未开放公开 API）",
    source: "scanstreet-adapter",
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
  const key = process.env.AMAP_WEB_KEY;
  const forceMock = process.env.FORCE_MOCK === "1";

  if (!key || forceMock) {
    return {
      pois: demoPois(params.geo, params.keywords, radius).slice(0, limit),
      mode: "demo",
      note: "未配置 AMAP_WEB_KEY，返回演示 POI。生产需接高德周边搜索；扫街榜实时人数目前无公开接口。",
    };
  }

  const url = new URL(AMAP_AROUND);
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${params.geo.lng},${params.geo.lat}`);
  url.searchParams.set("keywords", params.keywords || "咖啡");
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("offset", String(limit));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");
  url.searchParams.set("sortrule", "distance");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    return {
      pois: demoPois(params.geo, params.keywords, radius).slice(0, limit),
      mode: "demo",
      note: `高德请求失败(${res.status})，已降级演示数据。`,
    };
  }

  const data = (await res.json()) as {
    status: string;
    info?: string;
    pois?: AmapPoi[];
  };

  if (data.status !== "1" || !data.pois?.length) {
    return {
      pois: demoPois(params.geo, params.keywords, radius).slice(0, limit),
      mode: "demo",
      note: `高德无结果(${data.info || "empty"})，已降级演示数据。`,
    };
  }

  const pois = data.pois.map(mapAmapPoi).slice(0, limit);
  return {
    pois,
    mode: "live",
    note: "已使用高德周边搜索。店内实时人数/扫街榜榜单仍需商务接口，当前仅返回可用热度估算。",
  };
}
