"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  listening?: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

export function TalkButton({
  disabled,
  listening,
  onHoldStart,
  onHoldEnd,
}: Props) {
  const pressing = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const end = (e: Event) => {
      if (!pressing.current) return;
      // 忽略 mouse 在 touch 之后的二次触发
      if (e.type === "mouseup" && (e as MouseEvent).detail === 0) return;
      pressing.current = false;
      setActive(false);
      onHoldEnd();
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
  }, [onHoldEnd]);

  const begin = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pressing.current) return;
    pressing.current = true;
    setActive(true);
    onHoldStart();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active || listening}
      className={[
        "relative mx-auto flex h-24 w-24 touch-none items-center justify-center rounded-full",
        "bg-[linear-gradient(145deg,#1ec8a0,#0e7f6b)] text-[#07140f]",
        "shadow-[0_10px_40px_rgba(16,180,140,0.35)]",
        "transition-transform duration-200 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "select-none [-webkit-user-callout:none]",
        active || listening ? "scale-110" : "scale-100",
      ].join(" ")}
      onPointerDown={begin}
      onContextMenu={(e) => e.preventDefault()}
    >
      {(active || listening) && (
        <span className="absolute inset-[-10px] animate-ping rounded-full bg-[#1ec8a0]/25" />
      )}
      <span className="relative z-10 text-sm font-semibold tracking-wide">
        {listening ? "聆听中" : "按住说话"}
      </span>
    </button>
  );
}
