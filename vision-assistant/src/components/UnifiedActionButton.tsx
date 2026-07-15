"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type ActionMode = "voice" | "text" | "video";

type Props = {
  disabled?: boolean;
  listening?: boolean;
  mode: ActionMode;
  onModeChange: (mode: ActionMode) => void;
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  text: string;
  onTextChange: (v: string) => void;
  onTextSubmit: () => void;
  onEnterVideo: () => void;
};

const PICKER: Array<{ mode: ActionMode; label: string }> = [
  { mode: "voice", label: "语音" },
  { mode: "text", label: "文字" },
  { mode: "video", label: "视频" },
];

function IconMic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconText({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M8 6v12M16 6v12M7 18h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCam({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="6"
        width="13"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 10.5 21 8v8l-5-2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModeIcon({ mode, className }: { mode: ActionMode; className?: string }) {
  if (mode === "voice") return <IconMic className={className} />;
  if (mode === "text") return <IconText className={className} />;
  return <IconCam className={className} />;
}

function hitTestMode(
  clientX: number,
  clientY: number,
  root: HTMLElement | null,
): ActionMode | null {
  if (!root) return null;
  const nodes = root.querySelectorAll<HTMLElement>("[data-mode-pick]");
  let best: ActionMode | null = null;
  let bestDist = Infinity;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(clientX - cx, clientY - cy);
    const inside =
      clientX >= r.left - 16 &&
      clientX <= r.right + 16 &&
      clientY >= r.top - 28 &&
      clientY <= r.bottom + 28;
    const score = inside ? d * 0.3 : d;
    if (score < bestDist) {
      bestDist = score;
      best = el.dataset.modePick as ActionMode;
    }
  }
  if (bestDist > 80) return null;
  return best;
}

export function UnifiedActionButton({
  disabled,
  listening,
  mode,
  onModeChange,
  onVoiceStart,
  onVoiceEnd,
  text,
  onTextChange,
  onTextSubmit,
  onEnterVideo,
}: Props) {
  const uid = useId();
  const pressing = useRef(false);
  const voiceStarted = useRef(false);
  const pickerOpen = useRef(false);
  const selectedDuringSlide = useRef<ActionMode | null>(null);
  const startY = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [active, setActive] = useState(false);
  const [voiceArmed, setVoiceArmed] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [hoverMode, setHoverMode] = useState<ActionMode | null>(null);
  const [videoInput, setVideoInput] = useState<"voice" | "text">("voice");

  const stopVoice = useCallback(() => {
    if (voiceStarted.current) {
      voiceStarted.current = false;
      setVoiceArmed(false);
      onVoiceEnd();
    }
  }, [onVoiceEnd]);

  const applyMode = useCallback(
    (next: ActionMode) => {
      stopVoice();
      onModeChange(next);
      if (next === "video") {
        setVideoInput("voice");
        onEnterVideo();
      }
      try {
        navigator.vibrate?.(14);
      } catch {
        /* ignore */
      }
    },
    [onEnterVideo, onModeChange, stopVoice],
  );

  useEffect(() => {
    const pointFrom = (e: Event) => {
      if ("clientX" in e) {
        const pe = e as PointerEvent;
        return { x: pe.clientX, y: pe.clientY };
      }
      const te = e as TouchEvent;
      const t = te.touches[0] || te.changedTouches[0];
      return t ? { x: t.clientX, y: t.clientY } : null;
    };

    const onMove = (e: Event) => {
      if (!pressing.current) return;
      const point = pointFrom(e);
      if (!point) return;

      const lift = startY.current - point.y;
      if (!pickerOpen.current && lift > 36) {
        pickerOpen.current = true;
        setShowPicker(true);
        stopVoice();
        try {
          navigator.vibrate?.(8);
        } catch {
          /* ignore */
        }
      }

      if (pickerOpen.current) {
        const hit = hitTestMode(point.x, point.y, rootRef.current);
        selectedDuringSlide.current = hit;
        setHoverMode(hit);
      }
    };

    const end = (e: Event) => {
      if (!pressing.current) return;
      if (e.type === "mouseup" && (e as MouseEvent).detail === 0) return;
      pressing.current = false;
      setActive(false);

      const wasPicker = pickerOpen.current;
      const picked = selectedDuringSlide.current;
      pickerOpen.current = false;
      setShowPicker(false);
      setHoverMode(null);
      selectedDuringSlide.current = null;

      if (wasPicker) {
        stopVoice();
        if (picked) applyMode(picked);
        return;
      }

      if (voiceStarted.current) stopVoice();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [applyMode, stopVoice]);

  useEffect(() => {
    if (mode === "text" || (mode === "video" && videoInput === "text")) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode, videoInput]);

  const beginGesture = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-hold]")) return;
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pressing.current) return;

    pressing.current = true;
    voiceStarted.current = false;
    pickerOpen.current = false;
    selectedDuringSlide.current = null;
    startY.current = e.clientY;
    setActive(true);
    setHoverMode(null);
    setShowPicker(false);

    const canTalk =
      mode === "voice" || (mode === "video" && videoInput === "voice");
    if (canTalk) {
      voiceStarted.current = true;
      setVoiceArmed(true);
      onVoiceStart();
    }
  };

  /** Text mode: hold bottom strip / handle to slide-select modes */
  const beginPickerOnly = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pressing.current) return;
    pressing.current = true;
    startY.current = e.clientY;
    pickerOpen.current = true;
    setShowPicker(true);
    setActive(true);
    try {
      navigator.vibrate?.(8);
    } catch {
      /* ignore */
    }
  };

  const showTextPanel =
    mode === "text" || (mode === "video" && videoInput === "text");
  const showVoiceBar =
    mode === "voice" || (mode === "video" && videoInput === "voice");
  const pressed = active || listening || voiceArmed;

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-sm">
      <div
        className={[
          "pointer-events-none absolute inset-x-0 bottom-full mb-3 flex justify-center gap-5 transition-all duration-200",
          showPicker ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        ].join(" ")}
        aria-hidden={!showPicker}
      >
        {PICKER.map(({ mode: m, label }) => {
          const hot = hoverMode === m;
          return (
            <div
              key={m}
              data-mode-pick={m}
              className={[
                "flex size-14 flex-col items-center justify-center rounded-full shadow-[0_8px_24px_rgba(14,15,12,0.35)] transition-transform duration-150",
                hot
                  ? "scale-125 bg-[var(--primary)] text-[var(--ink)]"
                  : "scale-100 bg-[var(--canvas)] text-[var(--ink)]",
              ].join(" ")}
            >
              <ModeIcon mode={m} className="size-6" />
              <span className="mt-0.5 text-[9px] font-semibold">{label}</span>
            </div>
          );
        })}
      </div>

      {showTextPanel ? (
        <div className="wise-card space-y-2 p-3 shadow-[0_8px_28px_rgba(14,15,12,0.25)]">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[12px] font-semibold text-[var(--ink)]">
              {mode === "video" ? "视频 · 文字提问" : "文字提问"}
            </p>
            <button
              type="button"
              className="wise-chip bg-[var(--canvas-soft)] px-2.5 py-1 text-[10px] text-[var(--ink)]"
              onPointerDown={beginPickerOnly}
            >
              上滑切换功能
            </button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onTextSubmit();
            }}
          >
            <input
              ref={inputRef}
              data-no-hold
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="输入问题…"
              className="min-w-0 flex-1 rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--canvas)] px-4 py-3 text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
            />
            <button
              type="submit"
              data-no-hold
              disabled={disabled || !text.trim()}
              className="wise-btn wise-btn-primary wise-tap px-4 py-3 text-[13px] disabled:opacity-40"
            >
              发送
            </button>
          </form>
          {/* Drag handle for mode picker while in text */}
          <button
            type="button"
            aria-label="按住上滑切换功能"
            onPointerDown={beginPickerOnly}
            className="flex h-10 w-full touch-none items-center justify-center rounded-[var(--radius-xl)] bg-[var(--canvas-soft)] text-[var(--mute)]"
          >
            <span className="text-[11px] font-semibold">按住上滑 · 切换语音/文字/视频</span>
          </button>
        </div>
      ) : null}

      {showVoiceBar ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={pressed}
            aria-labelledby={`${uid}-voice-label`}
            onPointerDown={beginGesture}
            onContextMenu={(e) => e.preventDefault()}
            className={[
              "wise-btn wise-btn-primary wise-tap relative flex h-14 min-w-0 flex-1 touch-none items-center justify-center",
              "px-5 select-none [-webkit-user-select:none]",
              "disabled:cursor-not-allowed disabled:opacity-40",
              pressed ? "scale-[0.98] bg-[var(--primary-active)]" : "",
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              <IconMic className="size-5 shrink-0" />
              <span className="flex flex-col items-start">
                <span
                  id={`${uid}-voice-label`}
                  className="text-[15px] font-semibold leading-tight"
                >
                  {listening || voiceArmed ? "聆听中…松开" : "按住说话"}
                </span>
                <span className="text-[10px] font-medium text-[var(--ink)]/65">
                  {showPicker
                    ? "滑到上方图标松手"
                    : mode === "video"
                      ? "上滑切换 · 右侧改文字"
                      : "按住上滑切换功能"}
                </span>
              </span>
            </span>
          </button>

          {mode === "video" ? (
            <button
              type="button"
              data-no-hold
              aria-label="切换文字输入"
              onClick={() => setVideoInput("text")}
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--canvas)] text-[var(--ink)] shadow-[0_6px_20px_rgba(14,15,12,0.28)] active:scale-95"
            >
              <IconText className="size-6" />
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "video" && videoInput === "text" ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-no-hold
            aria-label="切换语音输入"
            onClick={() => setVideoInput("voice")}
            className="relative flex size-12 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--ink)] shadow-[0_6px_20px_rgba(14,15,12,0.28)] active:scale-95"
          >
            <IconMic className="size-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
