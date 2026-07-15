import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { PublicProfile } from "./types";

// Vercel 函数文件系统只读，持久目录用 /tmp；本地仍用项目 data/
const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "lanjie-data")
    : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "profiles.json");

let memoryStore: PublicProfile[] | null = null;

async function ensureStore(): Promise<PublicProfile[]> {
  if (memoryStore) return memoryStore;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, "utf8");
    memoryStore = JSON.parse(raw) as PublicProfile[];
    return memoryStore;
  } catch {
    memoryStore = [];
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(STORE_PATH, "[]", "utf8");
    } catch {
      // /tmp 也失败时纯内存兜底，避免整站 500
    }
    return memoryStore;
  }
}

async function writeStore(profiles: PublicProfile[]) {
  memoryStore = profiles;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(profiles, null, 2), "utf8");
  } catch {
    // 忽略磁盘写入失败，会话内仍可用内存
  }
}

export async function listProfiles(onlyDiscoverable = false) {
  const profiles = await ensureStore();
  return onlyDiscoverable
    ? profiles.filter((p) => p.discoverable)
    : profiles;
}

export async function getProfile(id: string) {
  const profiles = await ensureStore();
  return profiles.find((p) => p.id === id) ?? null;
}

export async function upsertProfile(input: {
  id?: string;
  displayName: string;
  occupation?: string;
  bio?: string;
  faceImageDataUrl: string;
  discoverable: boolean;
}): Promise<PublicProfile> {
  const profiles = await ensureStore();
  const now = Date.now();
  if (input.id) {
    const idx = profiles.findIndex((p) => p.id === input.id);
    if (idx >= 0) {
      const updated: PublicProfile = {
        ...profiles[idx],
        displayName: input.displayName.trim(),
        occupation: input.occupation?.trim() || undefined,
        bio: input.bio?.trim() || undefined,
        faceImageDataUrl: input.faceImageDataUrl,
        discoverable: input.discoverable,
        updatedAt: now,
      };
      profiles[idx] = updated;
      await writeStore(profiles);
      return updated;
    }
  }

  const created: PublicProfile = {
    id: input.id || nanoid(10),
    displayName: input.displayName.trim(),
    occupation: input.occupation?.trim() || undefined,
    bio: input.bio?.trim() || undefined,
    faceImageDataUrl: input.faceImageDataUrl,
    discoverable: input.discoverable,
    createdAt: now,
    updatedAt: now,
  };
  profiles.push(created);
  await writeStore(profiles);
  return created;
}

export async function deleteProfile(id: string) {
  const profiles = await ensureStore();
  const next = profiles.filter((p) => p.id !== id);
  await writeStore(next);
  return next.length !== profiles.length;
}
