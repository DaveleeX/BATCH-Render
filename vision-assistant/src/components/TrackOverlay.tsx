"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { ScreenTarget } from "@/lib/types";

export type TrackOverlayHandle = {
  /** Full replace markers (new labels / ids) */
  sync: (targets: ScreenTarget[], mirrored?: boolean) => void;
  /** Move existing pins without React re-render */
  move: (
    positions: Array<{ id: string; cx: number; cy: number; w?: number; h?: number }>,
    mirrored?: boolean,
  ) => void;
  clear: () => void;
};

type Props = {
  mirrored?: boolean;
};

function place(
  el: HTMLElement,
  cx: number,
  cy: number,
  w: number,
  h: number,
  mirrored: boolean,
) {
  const left = (mirrored ? 1 - cx : cx) * 100;
  const top = cy * 100;
  el.style.left = `${left}%`;
  el.style.top = `${top}%`;
  const box = el.querySelector<HTMLElement>("[data-box]");
  if (box) {
    box.style.width = `${w * 100}%`;
    box.style.height = `${h * 100}%`;
  }
}

export const TrackOverlay = forwardRef<TrackOverlayHandle, Props>(
  function TrackOverlay({ mirrored = false }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const mirroredRef = useRef(mirrored);
    mirroredRef.current = mirrored;

    useImperativeHandle(ref, () => ({
      sync(targets, mir) {
        const root = rootRef.current;
        if (!root) return;
        const m = mir ?? mirroredRef.current;
        root.replaceChildren();
        for (const t of targets) {
          const wrap = document.createElement("div");
          wrap.dataset.id = t.id;
          wrap.className = "absolute";
          wrap.style.transform = "translate(-50%, -50%)";
          wrap.style.willChange = "left, top";

          const box = document.createElement("div");
          box.dataset.box = "1";
          box.className = "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
          box.innerHTML = `
            <span class="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-white drop-shadow"></span>
            <span class="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-white drop-shadow"></span>
            <span class="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-white drop-shadow"></span>
            <span class="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-white drop-shadow"></span>
          `;

          const pin = document.createElement("div");
          pin.className =
            "relative flex flex-col items-center pointer-events-none";
          pin.innerHTML = `
            <span class="track-pulse relative flex size-2.5 items-center justify-center">
              <span class="absolute size-2.5 rounded-full bg-white"></span>
              <span class="absolute size-6 rounded-full border border-white/70"></span>
            </span>
            <span class="mt-1.5 max-w-[8rem] truncate bg-[#111111] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(0,0,0,0.35)]">${t.label.replace(/[<>&]/g, "")}</span>
          `;

          wrap.appendChild(box);
          wrap.appendChild(pin);
          root.appendChild(wrap);
          place(wrap, t.cx, t.cy, t.w, t.h, m);
        }
      },
      move(positions, mir) {
        const root = rootRef.current;
        if (!root) return;
        const m = mir ?? mirroredRef.current;
        for (const p of positions) {
          const el = root.querySelector<HTMLElement>(`[data-id="${p.id}"]`);
          if (!el) continue;
          place(el, p.cx, p.cy, p.w ?? 0.2, p.h ?? 0.2, m);
        }
      },
      clear() {
        rootRef.current?.replaceChildren();
      },
    }));

    useEffect(() => {
      // remirror on facing change without resyncing labels
      const root = rootRef.current;
      if (!root) return;
      for (const el of Array.from(root.children) as HTMLElement[]) {
        // leave positions; caller will move on next tick
        void el;
      }
    }, [mirrored]);

    return (
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-0 z-[15] overflow-hidden"
      />
    );
  },
);
