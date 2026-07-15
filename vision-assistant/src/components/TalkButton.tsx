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

  const pressed = active || listening;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      className={[
        "nike-pill nike-pill-primary nike-tap relative mx-auto flex h-11 w-full max-w-sm touch-none items-center justify-center",
        "px-6 select-none [-webkit-user-select:none]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        pressed ? "scale-[0.97] opacity-90" : "",
      ].join(" ")}
      onPointerDown={begin}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="text-[13px] font-medium tracking-wide">
        {listening ? "LISTENING · 聆听中" : "HOLD TO TALK · 按住说话"}
      </span>
    </button>
  );
}
