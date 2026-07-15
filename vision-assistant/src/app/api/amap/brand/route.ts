import { NextResponse } from "next/server";
import { brandPoisToTargets, searchBrandInMall } from "@/lib/amap";
import type { MallInfo } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const brand = String(searchParams.get("brand") || "").trim();
  const mallName = searchParams.get("mallName") || undefined;
  const mallId = searchParams.get("mallId") || undefined;
  const mallLat = Number(searchParams.get("mallLat"));
  const mallLng = Number(searchParams.get("mallLng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !brand) {
    return NextResponse.json(
      { error: "lat/lng/brand required" },
      { status: 400 },
    );
  }

  const mall: MallInfo | null = mallName
    ? {
        id: mallId || "client-mall",
        name: mallName,
        location:
          Number.isFinite(mallLat) && Number.isFinite(mallLng)
            ? { lat: mallLat, lng: mallLng }
            : { lat, lng },
        source: "amap",
      }
    : null;

  const result = await searchBrandInMall({
    geo: { lat, lng },
    brand,
    mall,
    limit: 5,
  });

  return NextResponse.json({
    ...result,
    brand,
    targets: brandPoisToTargets(result.pois),
  });
}
