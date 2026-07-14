"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ListedProfile = {
  id: string;
  displayName: string;
  occupation?: string;
  bio?: string;
  discoverable: boolean;
};

const LOCAL_ID_KEY = "lanjie_profile_id";

export default function ProfilePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [bio, setBio] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [faceImageDataUrl, setFaceImageDataUrl] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ListedProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profileId, setProfileId] = useState<string | undefined>();

  useEffect(() => {
    const id = localStorage.getItem(LOCAL_ID_KEY) || undefined;
    setProfileId(id);
    void refresh();
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setMessage("无法打开前置摄像头自拍");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function refresh() {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    setProfiles(data.profiles || []);
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFaceImageDataUrl(canvas.toDataURL("image/jpeg", 0.8));
  }

  async function save() {
    if (!displayName.trim() || !faceImageDataUrl) {
      setMessage("请填写昵称并拍一张脸部照片");
      return;
    }
    setSaving(true);
    setMessage("保存中…");
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: profileId,
          displayName,
          occupation,
          bio,
          discoverable,
          faceImageDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      localStorage.setItem(LOCAL_ID_KEY, data.profile.id);
      setProfileId(data.profile.id);
      setMessage(
        discoverable
          ? "已保存。他人在允许读取时，可通过摄像头问出你的公开身份。"
          : "已保存为不可发现。",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#16352c,transparent_45%),linear-gradient(165deg,#0b1210,#10241c_55%,#0b1210)] px-4 py-8 text-[#f3f7f4]">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">
              我的身份
            </h1>
            <p className="mt-1 text-sm text-[#b9d8cb]">
              仅在你主动开启「可被发现」后，其他用户才能通过画面问出你是谁。
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-[#f3efe6] px-3 py-1.5 text-xs font-medium text-[#132019]"
          >
            返回对话
          </Link>
        </div>

        <section className="space-y-3">
          <div className="overflow-hidden rounded-[1.5rem] bg-black/35">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={captureSelfie}
            className="w-full rounded-full bg-[#1ec8a0] px-4 py-3 text-sm font-semibold text-[#07140f]"
          >
            拍摄脸部照片
          </button>
          {faceImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faceImageDataUrl}
              alt="自拍预览"
              className="mx-auto h-28 w-28 rounded-full object-cover ring-2 ring-[#1ec8a0]/50"
            />
          ) : null}
        </section>

        <section className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>昵称 / 本名</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none"
              placeholder="例如：李明"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>职业</span>
            <input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none"
              placeholder="例如：产品设计师"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>公开简介</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-20 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none"
              placeholder="一句话介绍，可被语音朗读"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
              className="size-4"
            />
            允许他人通过摄像头读取我的公开信息
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-full bg-[#f3efe6] px-4 py-3 text-sm font-semibold text-[#132019] disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存身份"}
          </button>
          {message ? (
            <p className="text-sm leading-relaxed text-[#c9ebdb]">{message}</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm tracking-wide text-[#8fdcc4]">已登记身份</h2>
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-xs text-[#9ad9c3]">
                    {p.discoverable ? "可发现" : "私密"}
                  </span>
                </div>
                <p className="text-xs text-[#b7d8cb]">
                  {[p.occupation, p.bio].filter(Boolean).join(" · ") || "无简介"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
