"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onReady?: (video: HTMLVideoElement) => void;
  facingMode?: "user" | "environment";
};

type CamStatus = "idle" | "starting" | "live";

export function CameraView({ onReady, facingMode = "environment" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef(facingMode);
  const onReadyRef = useRef(onReady);
  const startGenRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [hasPreview, setHasPreview] = useState(false);

  facingRef.current = facingMode;
  onReadyRef.current = onReady;

  const detachStream = useCallback((stopTracks: boolean) => {
    const stream = streamRef.current;
    streamRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject === stream) {
      video.srcObject = null;
    }
    if (stopTracks && stream) {
      stream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    }
  }, []);

  const attachStream = useCallback(async (stream: MediaStream, gen: number) => {
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      const onReadyMeta = () => {
        video.removeEventListener("loadedmetadata", onReadyMeta);
        resolve();
      };
      video.addEventListener("loadedmetadata", onReadyMeta);
      // 兜底，避免个别机型不触发 loadedmetadata
      window.setTimeout(resolve, 800);
    });

    if (gen !== startGenRef.current) return false;

    try {
      await video.play();
    } catch {
      // 有些机型第一次 play 会失败，再试一次
      await new Promise((r) => window.setTimeout(r, 120));
      if (gen !== startGenRef.current) return false;
      await video.play();
    }

    if (gen !== startGenRef.current) return false;
    return true;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头。请用手机 Chrome / Safari 打开 HTTPS 链接。");
      return;
    }

    const gen = ++startGenRef.current;
    setStatus("starting");
    setError(null);

    // 先拿新流，成功后再停旧流，避免中间黑屏过久/竞态把新流掐掉
    let next: MediaStream | null = null;
    try {
      const facing = facingRef.current;
      try {
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
          },
        });
      } catch {
        // 个别手机对 facingMode 对象写法不兼容，再退一步
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      if (gen !== startGenRef.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      const old = streamRef.current;
      streamRef.current = next;
      next.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (streamRef.current !== next) return;
          setStatus("idle");
          setHasPreview(false);
          setError("摄像头被系统中断了，请再点一次开启。");
          detachStream(false);
        };
      });

      const ok = await attachStream(next, gen);
      if (!ok || gen !== startGenRef.current) {
        if (streamRef.current === next) detachStream(true);
        return;
      }

      if (old) {
        old.getTracks().forEach((t) => {
          t.onended = null;
          t.stop();
        });
      }

      setStatus("live");
      setHasPreview(true);
      if (videoRef.current) onReadyRef.current?.(videoRef.current);
    } catch (err) {
      if (next) next.getTracks().forEach((t) => t.stop());
      if (gen !== startGenRef.current) return;
      setStatus("idle");
      setHasPreview(false);      const name = err instanceof DOMException ? err.name : "Error";
      if (name === "NotAllowedError") {
        setError("相机权限被拒绝。请在浏览器地址栏旁允许摄像头后重试。");
      } else if (name === "NotFoundError") {
        setError("未检测到摄像头设备。");
      } else if (name === "NotReadableError") {
        setError("摄像头被其他应用占用，请关闭后重试。");
      } else {
        setError("无法打开摄像头。请确认使用 HTTPS，并允许相机权限。");
      }
    }
  }, [attachStream, detachStream]);

  // 跳过首次 mount，只在用户切换前后摄时重启，避免误杀画面流
  const facingBootRef = useRef(true);
  useEffect(() => {
    if (facingBootRef.current) {
      facingBootRef.current = false;
      return;
    }
    if (status !== "live") return;
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => {
    return () => {
      startGenRef.current += 1;
      detachStream(true);
    };
  }, [detachStream]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0d1a16]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, #1a4a3c 0%, transparent 40%), radial-gradient(circle at 80% 80%, #0f3a48 0%, transparent 45%), linear-gradient(160deg, #12261f, #0b1210 55%, #143028)",
        }}
      />
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        // 一旦拿到流就保持可见，避免 status 抖动导致“打开又关掉”
        className={[
          "h-full w-full object-cover bg-black transition-opacity duration-300",
          hasPreview || status === "starting" ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(6,12,10,0.55)_100%)]"
      />

      {status !== "live" ? (
        <div className="absolute inset-x-5 top-[38%] z-10 -translate-y-1/2 text-center">
          <p className="font-[family-name:var(--font-display)] text-5xl text-[#f6fff9]">
            览界
          </p>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[#d5efe4]">
            {status === "starting"
              ? "正在打开摄像头…"
              : "先开启摄像头，再按住说话提问"}
          </p>
          {error ? (
            <p className="mx-auto mt-3 max-w-sm rounded-2xl bg-[#f3efe6] px-4 py-3 text-sm text-[#132019]">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={status === "starting"}
            className="mt-5 rounded-full bg-[#1ec8a0] px-6 py-3 text-sm font-semibold text-[#07140f] disabled:opacity-60"
          >
            {status === "starting" ? "开启中…" : "点击开启摄像头"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 960,
): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.72);
}
