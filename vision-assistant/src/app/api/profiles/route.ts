import { NextResponse } from "next/server";
import {
  deleteProfile,
  listProfiles,
  upsertProfile,
} from "@/lib/profiles";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const onlyDiscoverable = searchParams.get("discoverable") === "1";
  const profiles = await listProfiles(onlyDiscoverable);
  // 不要把大图全部回传给列表；列表只回缩略信息
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      occupation: p.occupation,
      bio: p.bio,
      discoverable: p.discoverable,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      hasFace: Boolean(p.faceImageDataUrl),
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const displayName = String(body.displayName || "").trim();
  const faceImageDataUrl = String(body.faceImageDataUrl || "");
  if (!displayName || !faceImageDataUrl.startsWith("data:image")) {
    return NextResponse.json(
      { error: "displayName and face image required" },
      { status: 400 },
    );
  }

  const profile = await upsertProfile({
    id: body.id ? String(body.id) : undefined,
    displayName,
    occupation: body.occupation ? String(body.occupation) : undefined,
    bio: body.bio ? String(body.bio) : undefined,
    faceImageDataUrl,
    discoverable: Boolean(body.discoverable),
  });

  return NextResponse.json({ profile: { ...profile, faceImageDataUrl: undefined, hasFace: true } });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteProfile(id);
  return NextResponse.json({ ok });
}
