"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onReady?: (video: HTMLVideoElement) => void;
  facingMode?: "user" | "environment";
};

export function CameraView({ onReady, facingMode = "environment" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live">("idle");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头。请用手机 Chrome / Safari 打开 HTTPS 链接。");
      return;
    }
    setStatus("starting");
    setError(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopStream();
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();
      setStatus("live");
      onReady?.(video);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "Error";
      setStatus("idle");
      if (name === "NotAllowedError") {
        setError("相机权限被拒绝。请在浏览器地址栏旁允许摄像头后重试。");
      } else if (name === "NotFoundError") {
        setError("未检测到摄像头设备。");
      } else {
        setError("无法打开摄像头。请确认使用 HTTPS 公网链接，并允许相机权限。");
      }
    }
  }, [facingMode, onReady, stopStream]);

  useEffect(() => {
    // 切换前后摄时，若已开启则重启
    if (status === "live") {
      void startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => () => stopStream(), [stopStream]);

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
        className={[
          "h-full w-full object-cover transition-opacity duration-500",
          status === "live" ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(6,12,10,0.6)_100%)]"
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
