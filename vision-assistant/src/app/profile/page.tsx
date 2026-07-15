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
          displayName: displayName.trim(),
          occupation: occupation.trim() || undefined,
          bio: bio.trim() || undefined,
          discoverable,
          faceImageDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      const id = data.profile?.id as string | undefined;
      if (id) {
        localStorage.setItem(LOCAL_ID_KEY, id);
        setProfileId(id);
      }
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
    <main className="min-h-[100dvh] bg-[#f5f5f5] text-[#111111]">
      <div className="mx-auto max-w-md space-y-8 px-4 py-8 pb-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="nike-display text-[48px] text-[#111111]">身份</p>
            <p className="mt-2 max-w-[16rem] text-[13px] font-medium leading-snug text-[#707072]">
              仅在开启「可被发现」后，他人才能通过画面问出你是谁。
            </p>
          </div>
          <Link
            href="/"
            className="nike-pill nike-pill-primary nike-tap shrink-0 px-4 py-2 text-[12px]"
          >
            返回
          </Link>
        </div>

        <section className="space-y-3">
          <div className="overflow-hidden bg-[#111111]">
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
            className="nike-pill nike-pill-primary nike-tap w-full py-3.5 text-[15px]"
          >
            拍摄脸部照片
          </button>
          {faceImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faceImageDataUrl}
              alt="自拍预览"
              className="mx-auto h-24 w-24 rounded-full object-cover"
            />
          ) : null}
        </section>

        <section className="space-y-4 bg-white p-5">
          <label className="block space-y-1.5 text-[13px] font-medium text-[#39393b]">
            <span>昵称 / 本名</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border-0 border-b border-[#e5e5e5] bg-transparent py-2 text-[15px] text-[#111111] outline-none placeholder:text-[#9e9ea0]"
              placeholder="例如：李明"
            />
          </label>
          <label className="block space-y-1.5 text-[13px] font-medium text-[#39393b]">
            <span>职业</span>
            <input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className="w-full border-0 border-b border-[#e5e5e5] bg-transparent py-2 text-[15px] text-[#111111] outline-none placeholder:text-[#9e9ea0]"
              placeholder="例如：产品设计师"
            />
          </label>
          <label className="block space-y-1.5 text-[13px] font-medium text-[#39393b]">
            <span>公开简介</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-20 w-full resize-none border-0 border-b border-[#e5e5e5] bg-transparent py-2 text-[15px] text-[#111111] outline-none placeholder:text-[#9e9ea0]"
              placeholder="一句话介绍，可被语音朗读"
            />
          </label>
          <label className="flex items-center gap-3 text-[13px] font-medium text-[#111111]">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
              className="size-4 accent-[#111111]"
            />
            允许他人通过摄像头读取我的公开信息
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="nike-pill nike-pill-primary nike-tap w-full py-3.5 text-[15px] disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存身份"}
          </button>
          {message ? (
            <p className="text-[13px] font-medium leading-relaxed text-[#707072]">
              {message}
            </p>
          ) : null}
        </section>

        <section className="space-y-0 overflow-hidden bg-white">
          <div className="border-b border-[#e5e5e5] px-5 py-3">
            <p className="nike-display text-[12px] text-[#111111]">已登记</p>
          </div>
          <ul>
            {profiles.map((p, i) => (
              <li
                key={p.id}
                className={[
                  "px-5 py-3.5",
                  i > 0 ? "border-t border-[#e5e5e5]" : "",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium">{p.displayName}</span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[#707072]">
                    {p.discoverable ? "可发现" : "私密"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] font-medium text-[#707072]">
                  {[p.occupation, p.bio].filter(Boolean).join(" · ") || "无简介"}
                </p>
              </li>
            ))}
            {profiles.length === 0 ? (
              <li className="px-5 py-4 text-[13px] font-medium text-[#9e9ea0]">
                暂无登记
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </main>
  );
}
