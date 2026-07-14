import { NextResponse } from "next/server";
import { hasLiveModel } from "@/lib/model";

export async function GET() {
  let amap: "ok" | "plat_mismatch" | "demo" | "error" = "demo";
  if (process.env.AMAP_WEB_KEY) {
    try {
      const url = new URL("https://restapi.amap.com/v3/place/around");
      url.searchParams.set("key", process.env.AMAP_WEB_KEY);
      url.searchParams.set("location", "121.4737,31.2304");
      url.searchParams.set("keywords", "咖啡");
      url.searchParams.set("radius", "100");
      url.searchParams.set("offset", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json()) as { status?: string; info?: string };
      if (data.status === "1") amap = "ok";
      else if (data.info === "USERKEY_PLAT_NOMATCH") amap = "plat_mismatch";
      else amap = "error";
    } catch {
      amap = "error";
    }
  }

  return NextResponse.json({
    ok: true,
    product: "览界",
    ai: hasLiveModel() ? "live" : "demo",
    amap,
    note:
      amap === "plat_mismatch"
        ? "高德 Key 平台类型不匹配：请到控制台创建/启用「Web服务」Key（不是 JS API Key）。"
        : "扫街榜实时人数尚无公开 API，当前使用高德周边搜索 + 热度适配层。",
  });
}
