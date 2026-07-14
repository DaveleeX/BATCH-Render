import { NextResponse } from "next/server";
import { hasLiveModel } from "@/lib/model";

export async function GET() {
  return NextResponse.json({
    ok: true,
    product: "览界",
    ai: hasLiveModel() ? "live" : "demo",
    amap: process.env.AMAP_WEB_KEY ? "configured" : "demo",
    note: "扫街榜实时人数尚无公开 API，当前使用高德周边搜索 + 热度适配层。",
  });
}
