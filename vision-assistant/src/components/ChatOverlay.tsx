"use client";

import type { ChatMessage, PoiResult } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  pois: PoiResult[];
  status: string;
  mallName?: string;
};

export function ChatOverlay({ messages, pois, status, mallName }: Props) {
  const latest = messages.slice(-4);
  const lookingBrand = pois.some(
    (p) => p.floor || p.category === "商场品牌" || /（.*）/.test(p.name),
  );

  return (
    <div className="flex h-full min-h-0 flex-col justify-end gap-2">
      {status ? (
        <p className="shrink-0 text-center text-[12px] font-semibold text-white/85 drop-shadow">
          {status}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-col justify-end gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {latest.map((m) => (
          <div
            key={m.id}
            className={[
              "max-w-[85%] rounded-3xl px-4 py-2.5 text-[14px] leading-snug shadow-[0_8px_24px_rgba(14,15,12,0.28)]",
              m.role === "user"
                ? "ml-auto bg-[var(--ink)] font-semibold text-[var(--primary)]"
                : "mr-auto bg-white font-medium text-[var(--ink)]",
            ].join(" ")}
          >
            {m.content}
          </div>
        ))}

        {pois.length > 0 ? (
          <div className="pointer-events-auto wise-card shrink-0 overflow-hidden shadow-[0_8px_24px_rgba(14,15,12,0.2)]">
            <div className="border-b border-[var(--canvas-soft)] bg-[var(--primary-pale)] px-4 py-2">
              <p className="text-[12px] font-semibold text-[var(--ink-deep)]">
                {lookingBrand
                  ? mallName
                    ? `${mallName} · 品牌位置`
                    : "品牌位置"
                  : "附近推荐"}
              </p>
            </div>
            {pois.slice(0, 3).map((p, i) => (
              <a
                key={p.id}
                className={[
                  "block px-4 py-3",
                  i > 0 ? "border-t border-[var(--canvas-soft)]" : "",
                ].join(" ")}
                href={
                  p.location
                    ? `https://uri.amap.com/marker?position=${p.location.lng},${p.location.lat}&name=${encodeURIComponent(p.name)}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-[var(--ink)]">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-[var(--ink-deep)]">
                    {p.floor ||
                      (p.distanceMeters != null ? `${p.distanceMeters}m` : "")}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--body)]">
                  {[p.floor && !p.address?.includes(p.floor) ? p.floor : null, p.crowdLabel || p.address || p.category]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
