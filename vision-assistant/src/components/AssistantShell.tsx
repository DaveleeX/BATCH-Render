"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { CameraView, captureFrame } from "@/components/CameraView";
import { TalkButton } from "@/components/TalkButton";
import { ChatOverlay } from "@/components/ChatOverlay";
import { TrackOverlay } from "@/components/TrackOverlay";
import type { ScreenTarget } from "@/lib/types";
import {
  createPatch,
  trackBoxStep,
  type PatchStateHandle,
} from "@/lib/tracker";
import type { ChatMessage, GeoPoint, PoiResult } from "@/lib/types";

type SpeechResultList = {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 去掉「这是什么这是什么」这类叠句 */
export function collapseRepeatedSpeech(input: string): string {
  let t = input.replace(/\s+/g, " ").trim();
  if (!t) return t;

  // 连续相同短句折叠
  for (let n = 0; n < 4; n++) {
    const m = t.match(/^(.{2,40}?)\1+$/u);
    if (m) {
      t = m[1];
      continue;
    }
    break;
  }

  // 按标点切段，去掉连续重复段
  const parts = t
    .split(/([，。！？；、,.!?]+)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (/^[，。！？；、,.!?]+$/.test(part)) {
      if (out.length) out.push(part);
      continue;
    }
    if (out.length && out[out.length - 1] === part) continue;
    // 去掉「你好你好」这类段内重复
    const inner = part.match(/^(.{2,20}?)\1+$/u);
    out.push(inner ? inner[1] : part);
  }
  t = out.join("").replace(/\s+/g, " ").trim();

  // 对半分检测（整段翻倍粘贴）
  for (let round = 0; round < 3; round++) {
    const mid = Math.floor(t.length / 2);
    if (mid < 2) break;
    if (t.slice(0, mid) === t.slice(mid, mid * 2)) {
      t = t.slice(0, mid).trim();
      continue;
    }
    break;
  }
  return t;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // 不朗读括号注释 / markdown，减少“又念同一段”
  const clean = text
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[*_`#>-]/g, "")
    .replace(/\n+/g, "，")
    .trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "zh-CN";
  u.rate = 1.08;
  window.speechSynthesis.speak(u);
}

export function AssistantShell() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const transcriptRef = useRef("");
  const endingRef = useRef(false);
  const busyRef = useRef(false);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("按住按钮开始多轮对话");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pois, setPois] = useState<PoiResult[]>([]);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [provider, setProvider] = useState("demo");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [camRestart, setCamRestart] = useState(0);
  const [targets, setTargets] = useState<ScreenTarget[]>([]);
  const [trackSession, setTrackSession] = useState(0);
  const targetsRef = useRef<ScreenTarget[]>([]);
  const patchesRef = useRef<Map<string, PatchStateHandle>>(new Map());
  const trackFocusRef = useRef<string>("");
  const trackGenRef = useRef(0);

  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  const seedTargets = useCallback((next: ScreenTarget[]) => {
    const video = videoRef.current;
    const patches = new Map<string, PatchStateHandle>();
    if (video) {
      for (const t of next) {
        const patch = createPatch(video, {
          cx: t.cx,
          cy: t.cy,
          w: t.w,
          h: t.h,
        });
        if (patch) patches.set(t.id, patch);
      }
    }
    patchesRef.current = patches;
    setTargets(next);
  }, []);

  const beginTracking = useCallback(
    (next: ScreenTarget[], focus?: string) => {
      if (focus) trackFocusRef.current = focus;
      trackGenRef.current += 1;
      setTrackSession((n) => n + 1);
      seedTargets(next);
    },
    [seedTargets],
  );

  const clearTargets = useCallback(() => {
    patchesRef.current = new Map();
    trackFocusRef.current = "";
    trackGenRef.current += 1;
    setTrackSession((n) => n + 1);
    setTargets([]);
  }, []);

  // Optical follow between vision polls
  useEffect(() => {
    if (!targets.length) return;
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      if (now - last < 70) return;
      last = now;
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;

      const current = targetsRef.current;
      if (!current.length) return;

      let changed = false;
      const next = current.map((t) => {
        const prevPatch = patchesRef.current.get(t.id) || null;
        const hit = trackBoxStep(
          video,
          { cx: t.cx, cy: t.cy, w: t.w, h: t.h },
          prevPatch,
          144,
        );
        if (!hit) return t;
        // Lost lock: keep last position
        if (hit.score > 55) return t;
        patchesRef.current.set(t.id, hit.patch);
        const dx = Math.abs(hit.box.cx - t.cx);
        const dy = Math.abs(hit.box.cy - t.cy);
        if (dx < 0.002 && dy < 0.002) return t;
        changed = true;
        // Lerp for smoother AR feel
        return {
          ...t,
          cx: t.cx * 0.35 + hit.box.cx * 0.65,
          cy: t.cy * 0.35 + hit.box.cy * 0.65,
        };
      });

      if (changed) {
        targetsRef.current = next;
        setTargets(next);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [targets.length]);

  // Periodic vision re-localize so pins stay on the real object
  useEffect(() => {
    if (!targets.length) return;
    const gen = trackGenRef.current;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      if (cancelled || gen !== trackGenRef.current) return;
      const video = videoRef.current;
      if (!video?.videoWidth || busyRef.current) {
        timer = window.setTimeout(poll, 1600);
        return;
      }
      const imageDataUrl = captureFrame(video, 900, 0.78);
      if (!imageDataUrl) {
        timer = window.setTimeout(poll, 1600);
        return;
      }
      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl,
            focus: trackFocusRef.current || undefined,
            hints: targetsRef.current.map((t) => t.label),
          }),
        });
        const data = await res.json();
        if (cancelled || gen !== trackGenRef.current) return;
        const fresh = Array.isArray(data.targets)
          ? (data.targets as ScreenTarget[])
          : [];
        if (!fresh.length) {
          timer = window.setTimeout(poll, 2200);
          return;
        }

        const prev = targetsRef.current;
        const merged: ScreenTarget[] = fresh.map((f, i) => {
          const byLabel = prev.find((p) => p.label === f.label);
          const byIndex = prev[i];
          const id = byLabel?.id || byIndex?.id || f.id || nanoid(8);
          return { ...f, id };
        });
        seedTargets(merged);
      } catch {
        /* keep optical track */
      }
      if (!cancelled && gen === trackGenRef.current) {
        timer = window.setTimeout(poll, 1800);
      }
    };

    timer = window.setTimeout(poll, 1400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trackSession, seedTargets]);

  useEffect(() => {
    historyRef.current = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  }, [messages]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setMode(d.ai === "live" ? "live" : "demo");
        setProvider(String(d.provider || "demo"));
      })
      .catch(() => setMode("demo"));

    if (!navigator.geolocation) {
      setStatus("定位不可用，附近推荐会受影响");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => setStatus("请允许定位，以便推荐 50 米内地点"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const onReady = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
  }, []);

  const ask = useCallback(async (text: string) => {
    const cleaned = collapseRepeatedSpeech(text);
    if (!cleaned || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatus("思考中…");

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: "user",
      content: cleaned,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const imageDataUrl = videoRef.current
      ? captureFrame(videoRef.current, 1600, 0.92)
      : undefined;

    // 只用当前轮之前的历史，避免把本轮用户句再塞一遍
    const history = historyRef.current.slice(-6);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleaned,
          imageDataUrl: imageDataUrl || undefined,
          geo: geo || undefined,
          history,
        }),
      });
      const data = await res.json();
      let reply = String(data.reply || "我没听清，再说一次？");
      // 若模型几乎原样复读用户，截断提示
      if (
        reply.replace(/\s/g, "").includes(cleaned.replace(/\s/g, "")) &&
        reply.length < cleaned.length + 8
      ) {
        reply = "我听到了。你是想让我看画面、认人，还是查附近？";
      }
      setMessages((prev) => [
        ...prev,
        {
          id: nanoid(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        },
      ]);
      setPois(Array.isArray(data.pois) ? data.pois : []);
      if (data.provider) setProvider(String(data.provider));
      setMode(data.mode === "live" ? "live" : "demo");
      setStatus(
        Array.isArray(data.targets) && data.targets.length
          ? "已锁定目标 · 定位中"
          : data.mode === "live"
            ? "实时模式"
            : "演示模式",
      );
      if (Array.isArray(data.targets) && data.targets.length) {
        beginTracking(data.targets as ScreenTarget[], cleaned);
      } else if (
        /附近|周边|推荐/.test(cleaned) &&
        !/这是什么|手办|识别|看一眼|这是谁/.test(cleaned)
      ) {
        clearTargets();
      }
      speak(reply);
    } catch {
      setStatus("网络异常，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [geo, beginTracking, clearTargets]);

  const onHoldStart = useCallback(() => {
    if (busyRef.current) return;
    endingRef.current = false;

    // 关键停掉播报，否则麦克风会把上一句 TTS 再识别进去
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }

    finalTranscriptRef.current = "";
    transcriptRef.current = "";

    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setStatus("当前浏览器不支持语音识别，请用下方文字输入");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    // continuous=true 在国产手机浏览器上极易同一句反复追加
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = (result[0]?.transcript || "").trim();
        if (!piece) continue;
        if (result.isFinal) {
          const prev = finalTranscriptRef.current;
          // 相同 final 不重复拼接
          if (!prev.endsWith(piece)) {
            finalTranscriptRef.current = collapseRepeatedSpeech(
              `${prev}${piece}`,
            );
          }
        } else {
          interim += piece;
        }
      }
      const merged = collapseRepeatedSpeech(
        `${finalTranscriptRef.current}${interim}`,
      );
      transcriptRef.current = merged;
      setStatus(merged || "聆听中…");
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      setStatus("语音识别失败，可改用文字");
    };

    recognition.onend = () => {
      setListening(false);
      // continuous=false 时说完可能自动 end；按住期间自动重启一次会话
      if (
        recognitionRef.current === recognition &&
        !endingRef.current &&
        !busyRef.current
      ) {
        try {
          recognition.start();
          setListening(true);
        } catch {
          /* ignore */
        }
      }
    };

    recognitionRef.current = recognition;
    setListening(true);
    setStatus("聆听中…松开即发送");
    try {
      recognition.start();
    } catch {
      setStatus("无法启动麦克风");
      setListening(false);
    }
  }, []);

  const onHoldEnd = useCallback(() => {
    if (endingRef.current && !recognitionRef.current) return;
    endingRef.current = true;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);

    // 稍等最终结果回调
    window.setTimeout(() => {
      const text = collapseRepeatedSpeech(transcriptRef.current);
      finalTranscriptRef.current = "";
      transcriptRef.current = "";
      if (text) void ask(text);
      else setStatus("按住按钮开始多轮对话");
    }, 180);
  }, [ask]);

  return (
    <main className="relative h-[100dvh] min-h-[100svh] w-full overflow-hidden bg-[#111111] text-white">
      <CameraView
        facingMode={facing}
        onReady={onReady}
        restartSignal={camRestart}
      />

      <TrackOverlay targets={targets} mirrored={facing === "user"} />

      <header className="absolute inset-x-0 top-0 z-40 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="nike-display text-[28px] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
              览界
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium tracking-wide text-white/80">
              SEE MORE. ASK ANYTHING.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {targets.length ? (
              <button
                type="button"
                onClick={clearTargets}
                className="nike-pill nike-tap bg-white/90 px-2.5 py-1 text-[10px] font-medium text-[#111111]"
              >
                清除定位
              </button>
            ) : null}
            <span className="nike-pill bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[#111111]">
              {mode === "live" ? provider : "demo"}
            </span>
            <Link
              href="/profile"
              className="nike-pill nike-pill-on-image nike-tap px-3 py-1.5 text-[11px] font-medium"
            >
              我的身份
            </Link>
          </div>
        </div>
      </header>

      {/* Middle band: always between header and bottom chrome — never under controls */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] bottom-[10.75rem] z-20 px-4 sm:bottom-[11.25rem]">
        <div className="mx-auto h-full max-w-md pb-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
          <ChatOverlay messages={messages} pois={pois} status={status} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto max-w-md">
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                className="nike-pill nike-tap bg-white/95 px-2.5 py-1 text-[10px] font-medium text-[#111111]"
                onClick={() =>
                  setFacing((f) => (f === "environment" ? "user" : "environment"))
                }
              >
                切换镜头
              </button>
              <button
                type="button"
                className="nike-pill nike-tap bg-[#f5f5f5]/95 px-2.5 py-1 text-[10px] font-medium text-[#111111]"
                onClick={() => setCamRestart((n) => n + 1)}
              >
                重试
              </button>
            </div>
            <p className="text-[10px] font-medium text-white/65">
              {geo
                ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`
                : "定位中…"}
            </p>
          </div>

          <TalkButton
            disabled={busy}
            listening={listening}
            onHoldStart={onHoldStart}
            onHoldEnd={onHoldEnd}
          />

          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = textDraft;
              setTextDraft("");
              void ask(v);
            }}
          >
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="打字提问…"
              className="nike-pill min-w-0 flex-1 border-0 bg-white px-4 py-2 text-[13px] font-medium text-[#111111] outline-none placeholder:text-[#9e9ea0]"
            />
            <button
              type="submit"
              disabled={busy || !textDraft.trim()}
              className="nike-pill nike-pill-primary nike-tap px-4 py-2 text-[13px] disabled:opacity-40"
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
