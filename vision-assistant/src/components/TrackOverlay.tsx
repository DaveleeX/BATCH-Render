"use client";

import type { ScreenTarget } from "@/lib/types";

type Props = {
  targets: ScreenTarget[];
  /** front camera is mirrored in CSS */
  mirrored?: boolean;
};

export function TrackOverlay({ targets, mirrored }: Props) {
  if (!targets.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {targets.map((t) => {
        const left = (mirrored ? 1 - t.cx : t.cx) * 100;
        const top = t.cy * 100;
        const boxW = t.w * 100;
        const boxH = t.h * 100;

        return (
          <div key={t.id} className="absolute inset-0">
            {/* Bounding corners */}
            <div
              className="absolute"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${boxW}%`,
                height: `${boxH}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-white drop-shadow" />
              <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-white drop-shadow" />
              <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-white drop-shadow" />
              <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-white drop-shadow" />
            </div>

            {/* Pin + label at center */}
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span className="track-pulse relative flex size-3 items-center justify-center">
                <span className="absolute size-3 rounded-full bg-white" />
                <span className="absolute size-7 rounded-full border border-white/70" />
              </span>
              <span className="mt-2 max-w-[9rem] truncate bg-[#111111] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                {t.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
