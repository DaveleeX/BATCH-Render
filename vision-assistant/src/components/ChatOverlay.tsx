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
    <div className="flex h-full min-h-0 flex-col justify-end gap-2">
      {status ? (
        <p className="shrink-0 text-center text-[11px] font-medium text-white/75 drop-shadow">
          {status}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-col justify-end gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {latest.map((m) => (
          <div
            key={m.id}
            className={[
              "max-w-[85%] px-3.5 py-2.5 text-[14px] font-medium leading-snug shadow-[0_4px_16px_rgba(0,0,0,0.25)]",
              m.role === "user"
                ? "ml-auto rounded-[24px] bg-[#111111] text-white"
                : "mr-auto rounded-[20px] bg-white text-[#111111]",
            ].join(" ")}
          >
            {m.content}
          </div>
        ))}

        {pois.length > 0 ? (
          <div className="pointer-events-auto shrink-0 overflow-hidden bg-white shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
            <div className="border-b border-[#e5e5e5] px-3.5 py-1.5">
              <p className="nike-display text-[10px] text-[#111111]">NEARBY</p>
            </div>
            {pois.slice(0, 3).map((p, i) => (
              <a
                key={p.id}
                className={[
                  "block px-3.5 py-2.5",
                  i > 0 ? "border-t border-[#e5e5e5]" : "",
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
                  <span className="text-[14px] font-medium text-[#111111]">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-[#707072]">
                    {p.distanceMeters != null ? `${p.distanceMeters}m` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-[#707072]">
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
