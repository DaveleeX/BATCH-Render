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
    const up = () => {
      if (!pressing.current) return;
      pressing.current = false;
      setActive(false);
      onHoldEnd();
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [onHoldEnd]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active || listening}
      className={[
        "relative mx-auto flex h-24 w-24 items-center justify-center rounded-full",
        "bg-[linear-gradient(145deg,#1ec8a0,#0e7f6b)] text-[#07140f]",
        "shadow-[0_10px_40px_rgba(16,180,140,0.35)]",
        "transition-transform duration-200 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active || listening ? "scale-110" : "scale-100",
      ].join(" ")}
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        pressing.current = true;
        setActive(true);
        onHoldStart();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        if (disabled) return;
        pressing.current = true;
        setActive(true);
        onHoldStart();
      }}
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
