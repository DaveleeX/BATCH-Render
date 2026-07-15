"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type ActionMode = "voice" | "text";

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
};

function IconMic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
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
}: Props) {
  const uid = useId();
  const pressing = useRef(false);
  const voiceStarted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [active, setActive] = useState(false);
  const [voiceArmed, setVoiceArmed] = useState(false);

  const stopVoice = useCallback(() => {
    if (voiceStarted.current) {
      voiceStarted.current = false;
      setVoiceArmed(false);
      onVoiceEnd();
    }
  }, [onVoiceEnd]);

  const toggleMode = useCallback(() => {
    stopVoice();
    onModeChange(mode === "voice" ? "text" : "voice");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }, [mode, onModeChange, stopVoice]);

  useEffect(() => {
    if (mode === "text") {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  useEffect(() => {
    const end = (e: Event) => {
      if (!pressing.current) return;
      if (e.type === "mouseup" && (e as MouseEvent).detail === 0) return;
      pressing.current = false;
      setActive(false);
      if (voiceStarted.current) stopVoice();
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
  }, [stopVoice]);

  const beginVoice = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-mode-toggle]")) return;
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pressing.current || mode !== "voice") return;

    pressing.current = true;
    voiceStarted.current = true;
    setActive(true);
    setVoiceArmed(true);
    onVoiceStart();
  };

  const pressed = active || listening || voiceArmed;

  if (mode === "text") {
    return (
      <form
        className={[
          "mx-auto flex h-14 w-full max-w-sm items-center gap-2 rounded-full border-[3px] border-[var(--primary)] bg-[var(--primary)] pl-5 pr-1.5",
          "shadow-[0_8px_28px_rgba(14,15,12,0.22)]",
          disabled ? "opacity-40" : "",
        ].join(" ")}
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || disabled) return;
          onTextSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="输入问题…"
          enterKeyHint="send"
          aria-label="文字提问"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/45"
        />
        <button
          type="button"
          data-mode-toggle
          disabled={disabled}
          aria-label="切换到语音输入"
          onClick={toggleMode}
          className="wise-tap flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--ink)] shadow-[0_2px_8px_rgba(14,15,12,0.12)] disabled:opacity-40"
        >
          <span className="text-[18px] font-black leading-none tracking-tight">
            T
          </span>
        </button>
      </form>
    );
  }

  return (
    <div
      className={[
        "mx-auto flex h-14 w-full max-w-sm items-center gap-2 rounded-full border-[3px] border-[var(--primary)] bg-white pl-2 pr-1.5",
        "shadow-[0_8px_28px_rgba(14,15,12,0.22)]",
        disabled ? "opacity-40" : "",
        pressed ? "bg-[var(--primary-pale)]" : "",
      ].join(" ")}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={pressed}
        aria-labelledby={`${uid}-voice-label`}
        onPointerDown={beginVoice}
        onContextMenu={(e) => e.preventDefault()}
        className={[
          "flex h-full min-w-0 flex-1 touch-none items-center justify-center rounded-full px-3",
          "select-none [-webkit-user-select:none]",
          "disabled:cursor-not-allowed",
        ].join(" ")}
      >
        <span
          id={`${uid}-voice-label`}
          className="text-[15px] font-semibold text-[var(--ink)]"
        >
          {listening || voiceArmed ? "聆听中…松开" : "按住说话"}
        </span>
      </button>
      <button
        type="button"
        data-mode-toggle
        disabled={disabled}
        aria-label="切换到文字输入"
        onClick={toggleMode}
        className="wise-tap flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white disabled:opacity-40"
      >
        <IconMic className="size-5" />
      </button>
    </div>
  );
}
