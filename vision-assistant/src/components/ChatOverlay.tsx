"use client";

import type { ChatMessage, PoiResult } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  pois: PoiResult[];
  status: string;
};

export function ChatOverlay({ messages, pois, status }: Props) {
  const latest = messages.slice(-4);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-36 z-20 px-4">
      <div className="mx-auto max-w-md space-y-2">
        {status ? (
          <p className="text-center text-xs tracking-wide text-[#d7fff2]/80">
            {status}
          </p>
        ) : null}

        <div className="space-y-2">
          {latest.map((m) => (
            <div
              key={m.id}
              className={[
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed backdrop-blur-md",
                m.role === "user"
                  ? "ml-auto bg-[#10241c]/70 text-[#eafff6]"
                  : "mr-auto bg-[#f4f0e6]/90 text-[#132019]",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))}
        </div>

        {pois.length > 0 ? (
          <div className="pointer-events-auto space-y-1.5 rounded-2xl bg-[#08140f]/72 p-3 backdrop-blur-md">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8fdcc4]">
              Nearby
            </p>
            {pois.slice(0, 3).map((p) => (
              <a
                key={p.id}
                className="block border-t border-white/10 pt-1.5 first:border-0 first:pt-0"
                href={
                  p.location
                    ? `https://uri.amap.com/marker?position=${p.location.lng},${p.location.lat}&name=${encodeURIComponent(p.name)}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[#f4fff9]">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-[#9ad9c3]">
                    {p.distanceMeters != null ? `${p.distanceMeters}m` : ""}
                  </span>
                </div>
                <p className="text-xs text-[#b7d8cb]">
                  {p.crowdLabel || p.address || p.category}
                </p>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
