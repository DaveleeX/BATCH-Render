import { listProfiles } from "./profiles";
import { hasLiveModel, quickVisionText } from "./model";
import type { PublicProfile } from "./types";

export type MatchResult = {
  id: string;
  displayName: string;
  occupation?: string;
  bio?: string;
  confidence: number;
};

function naiveNameHint(text: string, profiles: PublicProfile[]) {
  const lower = text.toLowerCase();
  return profiles
    .filter((p) => lower.includes(p.displayName.toLowerCase()))
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      occupation: p.occupation,
      bio: p.bio,
      confidence: 0.55,
    }));
}

export async function matchPeopleInFrame(params: {
  imageDataUrl?: string;
  text: string;
}): Promise<MatchResult[]> {
  const discoverable = await listProfiles(true);
  if (!discoverable.length) return [];

  if (!params.imageDataUrl || !hasLiveModel()) {
    return naiveNameHint(params.text, discoverable).slice(0, 3);
  }

  const roster = discoverable
    .slice(0, 12)
    .map(
      (p, i) =>
        `${i + 1}. id=${p.id}; name=${p.displayName}; occupation=${p.occupation || "未知"}; bio=${p.bio || ""}`,
    )
    .join("\n");

  const answer = await quickVisionText({
    system:
      "你是人脸可见身份匹配助手。仅匹配用户主动公开（discoverable）的人物。若画面无人脸或不确定，返回空数组。只输出 JSON。",
    prompt: `用户问题：${params.text}

可发现人物名册：
${roster}

请观察画面中的人脸，判断是否匹配名册中的人。输出严格 JSON：
{"matches":[{"id":"...","confidence":0.0}]}
confidence 范围 0-1，低于 0.55 不要返回。最多 3 个。`,
    imageDataUrl: params.imageDataUrl,
  });

  if (!answer) return naiveNameHint(params.text, discoverable).slice(0, 3);

  try {
    const jsonStart = answer.indexOf("{");
    const jsonEnd = answer.lastIndexOf("}");
    const parsed = JSON.parse(answer.slice(jsonStart, jsonEnd + 1)) as {
      matches?: Array<{ id: string; confidence: number }>;
    };
    const byId = new Map(discoverable.map((p) => [p.id, p]));
    return (parsed.matches || [])
      .filter((m) => byId.has(m.id) && m.confidence >= 0.55)
      .slice(0, 3)
      .map((m) => {
        const p = byId.get(m.id)!;
        return {
          id: p.id,
          displayName: p.displayName,
          occupation: p.occupation,
          bio: p.bio,
          confidence: m.confidence,
        };
      });
  } catch {
    return [];
  }
}
