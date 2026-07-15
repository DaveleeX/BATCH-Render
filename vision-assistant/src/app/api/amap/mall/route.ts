import { NextResponse } from "next/server";
import { detectNearbyMall } from "@/lib/amap";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius") || 250);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const result = await detectNearbyMall({
    geo: { lat, lng },
    radiusMeters: radius,
  });
  return NextResponse.json(result);
}
