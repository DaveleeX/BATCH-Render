"use client";

import { useEffect, useRef, useState } from "react";

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
  onVideoPrimary: () => void;
  videoHint?: string;
};

const MODE_ORDER: ActionMode[] = ["voice", "text", "video"];

const MODE_META: Record<
  ActionMode,
  { title: string; hint: string; holdLabel: string }
> = {
  voice: {
    title: "语音",
    hint: "按住说话 · 长按切换",
    holdLabel: "聆听中…松开发送",
  },
  text: {
    title: "文字",
    hint: "输入后发送 · 长按切换",
    holdLabel: "文字模式",
  },
  video: {
    title: "视频",
    hint: "点按切换镜头 · 长按切换",
    holdLabel: "切换镜头中",
  },
};

function nextMode(cur: ActionMode): ActionMode {
  const i = MODE_ORDER.indexOf(cur);
  return MODE_ORDER[(i + 1) % MODE_ORDER.length];
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
  onVideoPrimary,
  videoHint,
}: Props) {
  const pressing = useRef(false);
  const didSwitch = useRef(false);
  const voiceStarted = useRef(false);
  const talkTimer = useRef<number | null>(null);
  const switchTimer = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [voiceArmed, setVoiceArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearTimers = () => {
    if (talkTimer.current) {
      window.clearTimeout(talkTimer.current);
      talkTimer.current = null;
    }
    if (switchTimer.current) {
      window.clearTimeout(switchTimer.current);
      switchTimer.current = null;
    }
  };

  useEffect(() => {
    const end = (e: Event) => {
      if (!pressing.current) return;
      if (e.type === "mouseup" && (e as MouseEvent).detail === 0) return;
      pressing.current = false;
      setActive(false);
      clearTimers();
      if (voiceStarted.current) {
        voiceStarted.current = false;
        setVoiceArmed(false);
        onVoiceEnd();
      }
      didSwitch.current = false;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [onVoiceEnd]);

  useEffect(() => {
    if (mode === "text") {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [mode]);

  const cycle = () => {
    const n = nextMode(mode);
    didSwitch.current = true;
    if (voiceStarted.current) {
      voiceStarted.current = false;
      setVoiceArmed(false);
      onVoiceEnd();
    }
    onModeChange(n);
    setFlash(`已切换：${MODE_META[n].title}`);
    window.setTimeout(() => setFlash(null), 900);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  };

  const begin = (e: React.PointerEvent) => {
    // Text inputs handle their own touches
    if ((e.target as HTMLElement).closest("input,button[type='submit']")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pressing.current) return;

    pressing.current = true;
    didSwitch.current = false;
    voiceStarted.current = false;
    setActive(true);

    // Long-press (≥650ms) → switch among voice / text / video
    switchTimer.current = window.setTimeout(() => {
      cycle();
    }, 650);

    // Medium hold in voice → talk (before switch threshold)
    if (mode === "voice") {
      talkTimer.current = window.setTimeout(() => {
        if (!pressing.current || didSwitch.current) return;
        voiceStarted.current = true;
        setVoiceArmed(true);
        onVoiceStart();
      }, 160);
    }
  };

  const onPrimaryClick = (e: React.MouseEvent) => {
    // Click (no hold) in video mode → toggle facing / restart camera
    if (mode !== "video") return;
    if (didSwitch.current || active) return;
    e.preventDefault();
    onVideoPrimary();
  };

  const meta = MODE_META[mode];
  const pressed = active || listening;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-2 flex items-center justify-center gap-2">
        {MODE_ORDER.map((m) => (
          <span
            key={m}
            className={[
              "wise-chip px-2.5 py-1 text-[10px] transition-colors",
              m === mode
                ? "bg-[var(--primary)] text-[var(--ink)]"
                : "bg-white/20 text-white/80",
            ].join(" ")}
          >
            {MODE_META[m].title}
          </span>
        ))}
      </div>

      {mode === "text" ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onTextSubmit();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="打字提问…"
            className="min-w-0 flex-1 rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--canvas)] px-4 py-3 text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="wise-btn wise-btn-primary wise-tap px-4 py-3 text-[13px] disabled:opacity-40"
          >
            发送
          </button>
          <button
            type="button"
            className="wise-btn wise-btn-surface wise-tap px-3 py-3 text-[12px]"
            onPointerDown={(e) => {
              // Long-press this side chip also cycles — quick tap cycles once
              e.stopPropagation();
            }}
            onClick={() => cycle()}
          >
            切换
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={pressed}
          onPointerDown={begin}
          onClick={onPrimaryClick}
          onContextMenu={(e) => e.preventDefault()}
          className={[
            "wise-btn wise-btn-primary wise-tap relative flex h-14 w-full touch-none items-center justify-center",
            "px-6 select-none [-webkit-user-select:none]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            pressed ? "scale-[0.97] bg-[var(--primary-active)]" : "",
          ].join(" ")}
        >
          <span className="flex flex-col items-center gap-0.5">
            <span className="text-[15px] font-semibold">
              {mode === "voice"
                ? listening || voiceArmed
                  ? meta.holdLabel
                  : "按住说话"
                : mode === "video"
                  ? videoHint || "点按切换镜头"
                  : meta.title}
            </span>
            <span className="text-[10px] font-medium text-[var(--ink)]/70">
              {flash || meta.hint}
            </span>
          </span>
        </button>
      )}

      {mode === "text" ? (
        <p className="mt-2 text-center text-[10px] font-medium text-white/70">
          {flash || "长按「切换」或点切换 · 语音 / 文字 / 视频"}
        </p>
      ) : null}
    </div>
  );
}
