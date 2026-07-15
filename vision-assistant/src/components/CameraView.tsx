"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onReady?: (video: HTMLVideoElement) => void;
  facingMode?: "user" | "environment";
  /** 外部强制重启（切换镜头/手动重试） */
  restartSignal?: number;
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
  facingMode = "environment",
  restartSignal = 0,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef(facingMode);
  const onReadyRef = useRef(onReady);
  const startGenRef = useRef(0);
  const bootFacingRef = useRef(true);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [debug, setDebug] = useState("未开启");

  facingRef.current = facingMode;
  onReadyRef.current = onReady;

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
        { audio: false, video: { facingMode: facing } },
        { audio: false, video: { facingMode: { ideal: facing } } },
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

  // 外部切换镜头 / 手动重试
  useEffect(() => {
    if (bootFacingRef.current) {
      bootFacingRef.current = false;
      return;
    }
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, restartSignal]);

  useEffect(() => {
    return () => {
      startGenRef.current += 1;
      clearStream(true);
    };
  }, [clearStream]);

  // live 后持续巡检，防止静默黑屏
  useEffect(() => {
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
  }, [status]);

  const showGate = status === "idle" || status === "starting" || status === "no_frames";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 z-0 h-full w-full object-cover"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          backgroundColor: "#000",
          transform: facingMode === "user" ? "scaleX(-1)" : undefined,
        }}
      />

      {/* 轻遮罩，避免把画面盖死 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/35 via-transparent to-black/45"
      />

      {showGate ? (
        <div className="absolute inset-x-5 top-[34%] z-10 -translate-y-1/2 text-center">
          <p className="font-[family-name:var(--font-display)] text-5xl text-[#f6fff9]">
            览界
          </p>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[#d5efe4]">
            {status === "starting"
              ? "正在打开摄像头…"
              : status === "no_frames"
                ? "权限已开启，但还没刷出画面"
                : "先开启摄像头，再按住说话提问"}
          </p>
          <p className="mt-2 text-[11px] text-[#9ad9c3]/80">{debug}</p>
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
            {status === "starting"
              ? "开启中…"
              : status === "no_frames"
                ? "重试摄像头"
                : "点击开启摄像头"}
          </button>
        </div>
      ) : null}

      {status === "live" ? (
        <p className="pointer-events-none absolute left-4 top-[max(5.5rem,env(safe-area-inset-top))] z-[5] rounded-full bg-black/45 px-2.5 py-1 text-[10px] text-[#b9ebda]">
          {debug}
        </p>
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
