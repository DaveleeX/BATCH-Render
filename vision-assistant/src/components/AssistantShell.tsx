"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { CameraView, captureFrame } from "@/components/CameraView";
import {
  UnifiedActionButton,
  type ActionMode,
} from "@/components/UnifiedActionButton";
import { ChatOverlay } from "@/components/ChatOverlay";
import { TrackOverlay, type TrackOverlayHandle } from "@/components/TrackOverlay";
import {
  createPatch,
  trackBoxStep,
  type PatchStateHandle,
} from "@/lib/tracker";
import { requestAllPermissions } from "@/lib/permissions";
import type { ChatMessage, GeoPoint, MallInfo, PoiResult, ScreenTarget } from "@/lib/types";

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
  const [mall, setMall] = useState<MallInfo | null>(null);
  const mallRef = useRef<MallInfo | null>(null);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [provider, setProvider] = useState("demo");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [camRestart, setCamRestart] = useState(0);
  const [camBoot, setCamBoot] = useState(0);
  const [permReady, setPermReady] = useState(false);
  const [permBusy, setPermBusy] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>("voice");
  const [trackingActive, setTrackingActive] = useState(false);
  const targetsRef = useRef<ScreenTarget[]>([]);
  const patchesRef = useRef<Map<string, PatchStateHandle>>(new Map());
  const trackFocusRef = useRef<string>("");
  const trackGenRef = useRef(0);
  const overlayRef = useRef<TrackOverlayHandle>(null);
  const patchRefreshRef = useRef(0);
  const trackModeRef = useRef<"follow" | "guide">("follow");

  const wantsTrack = useCallback((q: string) => {
    if (/在哪|在哪儿|在哪里|在几楼|在几层|怎么走|有没有/.test(q) &&
        /(星巴克|瑞幸|优衣库|无印|喜茶|奈雪|Apple|苹果|ZARA|H&M|品牌|店)/i.test(q)) {
      return false;
    }
    return /这是什么|什么东西|识别|看一下|这是啥|手办|杯子|品牌|logo|这是谁|他是谁|她是谁|前面是什么|拍到|对准/.test(
      q,
    );
  }, []);

  useEffect(() => {
    mallRef.current = mall;
  }, [mall]);

  // GPS ready → detect nearest mall for brand guidance
  useEffect(() => {
    if (!geo) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/amap/mall?lat=${geo.lat}&lng=${geo.lng}&radius=1200`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.mall) {
          setMall(data.mall as MallInfo);
          setStatus(
            `已识别：${(data.mall as MallInfo).name} · 问我「星巴克在哪」`,
          );
        } else {
          setMall(null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geo]);

  const beginTracking = useCallback((
    next: ScreenTarget[],
    focus?: string,
    mode: "follow" | "guide" = "follow",
  ) => {
    const video = videoRef.current;
    const patches = new Map<string, PatchStateHandle>();
    trackModeRef.current = mode;
    if (mode === "follow" && video) {
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
    targetsRef.current = next;
    if (focus) trackFocusRef.current = focus;
    trackGenRef.current += 1;
    patchRefreshRef.current = 0;
    overlayRef.current?.sync(next, facing === "user");
    setTrackingActive(next.length > 0);
  }, [facing]);

  const clearTargets = useCallback(() => {
    patchesRef.current = new Map();
    targetsRef.current = [];
    trackFocusRef.current = "";
    trackGenRef.current += 1;
    overlayRef.current?.clear();
    setTrackingActive(false);
  }, []);

  // Optical follow — DOM moves only, no React setState
  useEffect(() => {
    if (!trackingActive) return;
    let raf = 0;
    let last = 0;
    const gen = trackGenRef.current;

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      if (gen !== trackGenRef.current) return;
      if (now - last < 100) return; // ~10fps optical is enough
      last = now;
      if (trackModeRef.current === "guide") return; // mall brand pins stay fixed
      const video = videoRef.current;
      if (!video?.videoWidth) return;
      const current = targetsRef.current;
      if (!current.length) return;

      patchRefreshRef.current += 1;
      const refreshPatch = patchRefreshRef.current % 8 === 0;

      const next = current.map((t) => {
        const prevPatch = patchesRef.current.get(t.id) || null;
        const hit = trackBoxStep(
          video,
          { cx: t.cx, cy: t.cy, w: t.w, h: t.h },
          prevPatch,
          96,
        );
        if (!hit || hit.score > 70) return t;
        if (refreshPatch) {
          const fresh = createPatch(video, hit.box, 96);
          if (fresh) patchesRef.current.set(t.id, fresh);
          else patchesRef.current.set(t.id, hit.patch);
        } else {
          patchesRef.current.set(t.id, hit.patch);
        }
        return {
          ...t,
          cx: t.cx * 0.45 + hit.box.cx * 0.55,
          cy: t.cy * 0.45 + hit.box.cy * 0.55,
        };
      });

      targetsRef.current = next;
      overlayRef.current?.move(
        next.map((t) => ({ id: t.id, cx: t.cx, cy: t.cy, w: t.w, h: t.h })),
        facing === "user",
      );
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [trackingActive, facing]);

  // Rare vision re-localize (does not block chat)
  useEffect(() => {
    if (!trackingActive) return;
    const gen = trackGenRef.current;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      if (cancelled || gen !== trackGenRef.current) return;
      if (trackModeRef.current === "guide") {
        timer = window.setTimeout(poll, 8000);
        return;
      }
      if (document.hidden || busyRef.current) {
        timer = window.setTimeout(poll, 4000);
        return;
      }
      const video = videoRef.current;
      if (!video?.videoWidth) {
        timer = window.setTimeout(poll, 4000);
        return;
      }
      const imageDataUrl = captureFrame(video, 640, 0.65);
      if (!imageDataUrl) {
        timer = window.setTimeout(poll, 4000);
        return;
      }
      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl,
            focus: trackFocusRef.current || undefined,
            hints: targetsRef.current.map((t) => t.label).slice(0, 2),
          }),
        });
        const data = await res.json();
        if (cancelled || gen !== trackGenRef.current) return;
        const fresh = Array.isArray(data.targets)
          ? (data.targets as ScreenTarget[])
          : [];
        if (fresh.length) {
          const prev = targetsRef.current;
          const merged = fresh.slice(0, 2).map((f, i) => {
            const byLabel = prev.find((p) => p.label === f.label);
            const id = byLabel?.id || prev[i]?.id || f.id || nanoid(8);
            return { ...f, id };
          });
          const videoEl = videoRef.current;
          const patches = new Map<string, PatchStateHandle>();
          if (videoEl) {
            for (const t of merged) {
              const patch = createPatch(videoEl, t, 96);
              if (patch) patches.set(t.id, patch);
            }
          }
          patchesRef.current = patches;
          targetsRef.current = merged;
          overlayRef.current?.sync(merged, facing === "user");
        }
      } catch {
        /* optical only */
      }
      if (!cancelled && gen === trackGenRef.current) {
        timer = window.setTimeout(poll, 5000);
      }
    };

    timer = window.setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trackingActive, facing]);

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
  }, []);

  const bootstrapPermissions = useCallback(async () => {
    if (permBusy || permReady) return;
    setPermBusy(true);
    setStatus("正在申请相机 / 麦克风 / 定位…");
    try {
      const snap = await requestAllPermissions();
      if (snap.geo) setGeo(snap.geo);
      else if (!snap.geolocation) {
        setStatus("定位未授权，附近商场会受影响");
      }
      if (!snap.camera) {
        setStatus("相机未授权，请在浏览器设置中允许");
      } else if (!snap.microphone) {
        setStatus("麦克风未授权，可改用文字模式");
      } else {
        setStatus("按住说话 · 上滑切换语音/文字");
      }
      setPermReady(true);
      setCamBoot((n) => n + 1);
    } finally {
      setPermBusy(false);
    }
  }, [permBusy, permReady]);

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

    // Smaller frame → faster upload + model TTFT
    const imageDataUrl = videoRef.current
      ? captureFrame(videoRef.current, 960, 0.72)
      : undefined;

    const history = historyRef.current.slice(-6);
    const track = wantsTrack(cleaned);

    // Kick detect in parallel — never block chat reply wait
    const detectPromise =
      track && imageDataUrl
        ? fetch("/api/detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl,
              focus: cleaned,
            }),
          })
            .then((r) => r.json())
            .catch(() => null)
        : null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleaned,
          imageDataUrl: imageDataUrl || undefined,
          geo: geo || undefined,
          mall: mallRef.current || undefined,
          history,
        }),
      });
      const data = await res.json();
      let reply = String(data.reply || "我没听清，再说一次？");
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
      if (data.mall) setMall(data.mall as MallInfo);
      if (data.provider) setProvider(String(data.provider));
      setMode(data.mode === "live" ? "live" : "demo");
      setStatus(
        data.brand
          ? `品牌导航：${data.brand}`
          : data.mode === "live"
            ? "实时模式"
            : "演示模式",
      );
      speak(reply);

      const brandTargets = Array.isArray(data.brandTargets)
        ? (data.brandTargets as ScreenTarget[])
        : [];
      if (brandTargets.length) {
        beginTracking(brandTargets, cleaned, "guide");
      } else if (/附近|周边|推荐/.test(cleaned) && !track) {
        clearTargets();
      }

      // Apply vision pins when ready without delaying TTS
      if (detectPromise && !brandTargets.length) {
        void detectPromise.then((det) => {
          const targets = Array.isArray(det?.targets)
            ? (det.targets as ScreenTarget[])
            : [];
          if (targets.length) {
            beginTracking(targets.slice(0, 2), cleaned);
            setStatus("已锁定目标");
          }
        });
      } else if (data.needTrack && imageDataUrl && !brandTargets.length) {
        void fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, focus: cleaned }),
        })
          .then((r) => r.json())
          .then((det) => {
            const targets = Array.isArray(det?.targets)
              ? (det.targets as ScreenTarget[])
              : [];
            if (targets.length) beginTracking(targets.slice(0, 2), cleaned);
          })
          .catch(() => undefined);
      }
    } catch {
      setStatus("网络异常，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [geo, beginTracking, clearTargets, wantsTrack]);

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
    <main className="relative h-[100dvh] min-h-[100svh] w-full overflow-hidden bg-[var(--ink)] text-white">
      <CameraView
        facingMode={facing}
        onReady={onReady}
        restartSignal={camRestart}
        bootSignal={camBoot}
        suppressGate={!permReady}
      />

      <TrackOverlay ref={overlayRef} mirrored={facing === "user"} />

      {!permReady ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--ink)] px-6 text-center">
          <p className="wise-display text-[64px] text-[var(--primary)] sm:text-[76px]">
            览界
          </p>
          <p className="mx-auto mt-4 max-w-xs text-[15px] font-medium leading-snug text-white/90">
            开始前将一次性申请相机、麦克风与定位权限
          </p>
          <ul className="mt-5 space-y-1.5 text-left text-[13px] font-medium text-white/75">
            <li>· 相机：看你眼前的画面</li>
            <li>· 麦克风：按住说话提问</li>
            <li>· 定位：找附近商场与品牌</li>
          </ul>
          <button
            type="button"
            disabled={permBusy}
            onClick={() => void bootstrapPermissions()}
            className="wise-btn wise-btn-primary wise-tap mt-8 px-10 py-3.5 text-[15px] disabled:opacity-60"
          >
            {permBusy ? "授权中…" : "开始并授权全部权限"}
          </button>
        </div>
      ) : null}

      <header className="absolute inset-x-0 top-0 z-40 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="wise-display text-[30px] text-[var(--primary)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              览界
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-white/85">
              {mall
                ? `${mall.name}${mall.distanceMeters != null ? ` · ${mall.distanceMeters}m` : ""}`
                : "看见，并告诉你答案"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {trackingActive ? (
              <button
                type="button"
                onClick={clearTargets}
                className="wise-chip wise-tap bg-[var(--canvas)] px-2.5 py-1.5 text-[10px] text-[var(--ink)]"
              >
                清除定位
              </button>
            ) : null}
            <span className="wise-chip bg-[var(--primary-pale)] px-2.5 py-1.5 text-[10px] text-[var(--ink-deep)]">
              {mode === "live" ? provider : "demo"}
            </span>
            <Link
              href="/profile"
              className="wise-btn wise-btn-primary wise-tap px-3.5 py-2 text-[12px]"
            >
              我的身份
            </Link>
          </div>
        </div>
      </header>

      {/* Middle band — leave room for compact unified control */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] bottom-[8.5rem] z-20 px-4 sm:bottom-[9rem]">
        <div className="mx-auto h-full max-w-md pb-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
          <ChatOverlay
            messages={messages}
            pois={pois}
            status={status}
            mallName={mall?.name}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto max-w-md space-y-2">
          {mall && actionMode === "voice" ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {["星巴克在哪", "优衣库在几楼", "喜茶在哪"].map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy}
                  className="wise-chip wise-tap bg-[var(--primary)] px-2.5 py-1.5 text-[10px] text-[var(--ink)] disabled:opacity-40"
                  onClick={() => void ask(q)}
                >
                  {q.replace(/在哪|在几楼/g, "")}
                </button>
              ))}
            </div>
          ) : null}

          <UnifiedActionButton
            disabled={busy || !permReady}
            listening={listening}
            mode={actionMode}
            onModeChange={(m) => {
              setActionMode(m);
              if (m === "voice") setStatus("按住说话 · 上滑切换文字");
              if (m === "text") setStatus("文字模式 · 上滑可切回语音");
            }}
            onVoiceStart={onHoldStart}
            onVoiceEnd={onHoldEnd}
            text={textDraft}
            onTextChange={setTextDraft}
            onTextSubmit={() => {
              const v = textDraft;
              setTextDraft("");
              void ask(v);
            }}
          />

          <p className="text-center text-[10px] font-medium text-white/55">
            {geo
              ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`
              : permReady
                ? "定位中…"
                : ""}
          </p>
        </div>
      </div>
    </main>
  );
}
