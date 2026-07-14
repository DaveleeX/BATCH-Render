"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { CameraView, captureFrame } from "@/components/CameraView";
import { TalkButton } from "@/components/TalkButton";
import { ChatOverlay } from "@/components/ChatOverlay";
import type { ChatMessage, GeoPoint, PoiResult } from "@/lib/types";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function AssistantShell() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("按住按钮开始多轮对话");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pois, setPois] = useState<PoiResult[]>([]);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [facing, setFacing] = useState<"user" | "environment">("environment");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setMode(d.ai === "live" ? "live" : "demo"))
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

  const history = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    [messages],
  );

  const ask = useCallback(
    async (text: string) => {
      const cleaned = text.trim();
      if (!cleaned || busy) return;
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
        ? captureFrame(videoRef.current)
        : undefined;

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
        const reply = String(data.reply || "我没听清，再说一次？");
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
        setMode(data.mode === "live" ? "live" : "demo");
        setStatus(data.mode === "live" ? "实时模式" : "演示模式");
        speak(reply);
      } catch {
        setStatus("网络异常，请重试");
      } finally {
        setBusy(false);
      }
    },
    [busy, geo, history],
  );

  const onHoldStart = useCallback(() => {
    if (busy) return;
    const Ctor = getSpeechRecognition();
    transcriptRef.current = "";
    if (!Ctor) {
      setStatus("当前浏览器不支持语音识别，请用下方文字输入");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript || "";
      }
      transcriptRef.current = text;
      setStatus(text || "聆听中…");
    };
    recognition.onerror = () => {
      setStatus("语音识别失败，可改用文字");
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    setStatus("聆听中…松开即发送");
    try {
      recognition.start();
    } catch {
      setStatus("无法启动麦克风");
    }
  }, [busy]);

  const onHoldEnd = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    const text = transcriptRef.current.trim();
    transcriptRef.current = "";
    if (text) void ask(text);
    else setStatus("按住按钮开始多轮对话");
  }, [ask]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-[#f3f7f4]">
      <CameraView facingMode={facing} onReady={onReady} />

      <header className="absolute inset-x-0 top-0 z-20 px-5 pt-[max(1.1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-md items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-[#f6fff9] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
              览界
            </p>
            <p className="mt-1 max-w-[16rem] text-sm text-[#d9efe6]/90">
              看见，并告诉你答案
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] tracking-wide text-[#b9ebda] backdrop-blur-md">
              {mode === "live" ? "LIVE" : "DEMO"}
            </span>
            <Link
              href="/profile"
              className="rounded-full bg-[#f3efe6]/92 px-3 py-1.5 text-xs font-medium text-[#132019]"
            >
              我的身份
            </Link>
          </div>
        </div>
      </header>

      <ChatOverlay messages={messages} pois={pois} status={status} />

      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <button
              type="button"
              className="rounded-full bg-black/40 px-3 py-1.5 text-xs text-[#d7fff2] backdrop-blur-md"
              onClick={() =>
                setFacing((f) => (f === "environment" ? "user" : "environment"))
              }
            >
              切换镜头
            </button>
            <p className="text-[11px] text-[#c6e6da]/80">
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
            className="mt-3 flex gap-2"
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
              placeholder="或直接打字：附近热门咖啡馆"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/45 px-4 py-2.5 text-sm text-[#f4fff9] outline-none backdrop-blur-md placeholder:text-white/40"
            />
            <button
              type="submit"
              disabled={busy || !textDraft.trim()}
              className="rounded-full bg-[#f3efe6] px-4 py-2.5 text-sm font-medium text-[#132019] disabled:opacity-40"
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
