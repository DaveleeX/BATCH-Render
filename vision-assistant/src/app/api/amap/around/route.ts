import { NextResponse } from "next/server";
import { searchNearbyPois } from "@/lib/amap";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const keywords = searchParams.get("keywords") || "咖啡";
  const radius = Number(searchParams.get("radius") || 50);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const result = await searchNearbyPois({
    geo: { lat, lng },
    keywords,
    radiusMeters: radius,
    limit: 8,
  });
  return NextResponse.json(result);
}
