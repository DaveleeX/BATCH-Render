"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onReady?: (video: HTMLVideoElement) => void;
  onStopped?: () => void;
  facingMode?: "user" | "environment";
  /** When false, camera stays off and stream is released */
  active?: boolean;
  /** 外部强制重启（切换镜头/手动重试） */
  restartSignal?: number;
  /** hide the in-view enable gate when parent controls camera from chrome */
  suppressGate?: boolean;
};

type CamStatus = "idle" | "starting" | "live" | "no_frames";

async function wait(ms: number) {
  await new Promise((r) => window.setTimeout(r, ms));
}

async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
      return true;
    }
    await wait(80);
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

export function CameraView({
  onReady,
  onStopped,
  facingMode = "environment",
  active = false,
  restartSignal = 0,
  suppressGate = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef(facingMode);
  const onReadyRef = useRef(onReady);
  const onStoppedRef = useRef(onStopped);
  const startGenRef = useRef(0);
  const bootFacingRef = useRef(true);
  const activeRef = useRef(active);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [debug, setDebug] = useState("未开启");

  facingRef.current = facingMode;
  onReadyRef.current = onReady;
  onStoppedRef.current = onStopped;
  activeRef.current = active;

  const clearStream = useCallback((stopTracks: boolean) => {
    const stream = streamRef.current;
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    }
    if (stopTracks && stream) {
      for (const track of stream.getTracks()) {
        track.onended = null;
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const bindStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return false;

    // iOS Safari：必须用这些属性，且建议先清空再绑定
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("autoplay", "true");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.controls = false;

    video.srcObject = null;
    await wait(30);
    video.srcObject = stream;

    // 等元数据
    if (video.readyState < 1) {
      await Promise.race([
        new Promise<void>((resolve) => {
          const done = () => {
            video.removeEventListener("loadedmetadata", done);
            resolve();
          };
          video.addEventListener("loadedmetadata", done);
        }),
        wait(1200),
      ]);
    }

    try {
      await video.play();
    } catch {
      await wait(100);
      await video.play();
    }

    const ok = await waitForVideoFrame(video, 2800);
    return ok;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头。请用系统 Safari / Chrome 打开。");
      setStatus("idle");
      return;
    }

    const gen = ++startGenRef.current;
    setStatus("starting");
    setError(null);
    setDebug("请求权限…");

    let next: MediaStream | null = null;
    try {
      const facing = facingRef.current;
      // iOS 对约束很敏感：优先极简约束，再回退
      const attempts: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { audio: false, video: { facingMode: facing } },
        { audio: false, video: true },
      ];

      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          next = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!next) throw lastErr ?? new Error("getUserMedia failed");

      if (gen !== startGenRef.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      const old = streamRef.current;
      streamRef.current = next;

      const track = next.getVideoTracks()[0];
      setDebug(
        track
          ? `轨道:${track.label || track.readyState} (${facing})`
          : "无视频轨道",
      );
      if (track) {
        track.onended = () => {
          if (streamRef.current !== next) return;
          setStatus("idle");
          setDebug("轨道已结束");
          setError("摄像头被系统中断，请重新开启。");
          clearStream(false);
        };
      }

      const ok = await bindStreamToVideo(next);
      if (gen !== startGenRef.current) return;

      if (old) {
        for (const t of old.getTracks()) {
          t.onended = null;
          t.stop();
        }
      }

      const video = videoRef.current;
      if (!ok || !video || video.videoWidth === 0) {
        setStatus("no_frames");
        setDebug(
          `无画面帧 ${video?.videoWidth || 0}x${video?.videoHeight || 0}`,
        );
        setError(
          "已拿到相机权限，但画面没有出来。请点下方重试；若在 App 内置浏览器，请用 Safari 打开。",
        );
        // 仍把 video 交给上层，方便后面抓帧失败时有明确提示
        if (video) onReadyRef.current?.(video);
        return;
      }

      setStatus("live");
      setDebug(`画面 ${video.videoWidth}x${video.videoHeight}`);
      setError(null);
      onReadyRef.current?.(video);
    } catch (err) {
      if (next) next.getTracks().forEach((t) => t.stop());
      if (gen !== startGenRef.current) return;
      clearStream(true);
      setStatus("idle");
      setDebug("启动失败");
      const name = err instanceof DOMException ? err.name : "Error";
      if (name === "NotAllowedError") {
        setError("相机权限被拒绝。请在地址栏站点设置里允许摄像头。");
      } else if (name === "NotFoundError") {
        setError("未检测到摄像头。");
      } else if (name === "NotReadableError") {
        setError("摄像头被占用。请关闭其他占用相机的 App 后重试。");
      } else {
        setError("无法打开摄像头。请用系统 Safari 打开本站并允许相机。");
      }
    }
  }, [bindStreamToVideo, clearStream]);

  // 外部切换镜头 / 手动重试（仅在 active 时）
  useEffect(() => {
    if (bootFacingRef.current) {
      bootFacingRef.current = false;
      return;
    }
    if (!activeRef.current) return;
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, restartSignal]);

  // Parent toggles camera dialogue mode
  useEffect(() => {
    if (active) {
      void startCamera();
      return;
    }
    startGenRef.current += 1;
    clearStream(true);
    setStatus("idle");
    setDebug("已关闭");
    setError(null);
    onStoppedRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    return () => {
      startGenRef.current += 1;
      clearStream(true);
    };
  }, [clearStream]);

  // live 后持续巡检，防止静默黑屏
  useEffect(() => {
    if (!active) return;
    if (status !== "live" && status !== "no_frames") return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!video || !track || track.readyState !== "live") {
        setStatus("idle");
        setDebug("流已丢失");
        setError("摄像头已断开，请重新开启。");
        return;
      }
      if (video.videoWidth === 0) {
        setStatus("no_frames");
        setDebug("巡检: 无画面");
      } else {
        setStatus("live");
        setDebug(`画面 ${video.videoWidth}x${video.videoHeight}`);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [status, active]);

  const showGate =
    active && (status === "idle" || status === "starting" || status === "no_frames");

  return (
    <div
      className={[
        "absolute inset-0 overflow-hidden",
        active ? "bg-black" : "bg-[var(--ink)]",
      ].join(" ")}
    >
      {!active ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(159,232,112,0.14),transparent_48%),linear-gradient(180deg,#1a1c18_0%,var(--ink)_55%,#0a0b09_100%)]"
        />
      ) : null}

      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={[
          "absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-300",
          active && status === "live" ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          backgroundColor: "#000",
          transform: facingMode === "user" ? "scaleX(-1)" : undefined,
        }}
      />

      {/* Soft ink vignette for Readable Wise chrome on camera */}
      {active ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(14,15,12,0.55)_0%,transparent_30%,transparent_58%,rgba(14,15,12,0.78)_100%)]"
        />
      ) : null}

      {showGate && !suppressGate ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <p className="wise-display text-[64px] text-[var(--primary)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] sm:text-[76px]">
            览界
          </p>
          <p className="mx-auto mt-4 max-w-[18rem] text-[15px] font-medium leading-snug text-white/90">
            {status === "starting"
              ? "正在打开摄像头…"
              : status === "no_frames"
                ? "权限已开，画面未就绪"
                : "启用摄像头，按住说话提问"}
          </p>
          <p className="mt-2 text-[11px] font-medium text-white/50">{debug}</p>
          {error ? (
            <p className="wise-card mx-auto mt-4 max-w-sm px-4 py-3 text-[13px] font-medium leading-snug text-[var(--ink)]">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={status === "starting"}
            className="wise-btn wise-btn-primary wise-tap mt-6 px-8 py-3.5 text-[15px] disabled:opacity-60"
          >
            {status === "starting"
              ? "开启中…"
              : status === "no_frames"
                ? "重试摄像头"
                : "开启摄像头"}
          </button>
        </div>
      ) : null}

      {active && status === "live" ? (
        <p className="pointer-events-none absolute right-4 top-[max(4.25rem,env(safe-area-inset-top))] z-[5] wise-chip bg-[var(--ink)]/70 px-2.5 py-1 text-[9px] text-[var(--primary)]">
          {debug}
        </p>
      ) : null}
    </div>
  );
}

export function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 1600,
  quality = 0.92,
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
  // 提升锐度，利于读 logo / 杯套文字
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
