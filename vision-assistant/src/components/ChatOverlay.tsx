"use client";

import type { ChatMessage, PoiResult } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  pois: PoiResult[];
  status: string;
};

export function ChatOverlay({ messages, pois, status }: Props) {
  const latest = messages.slice(-3);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-40 z-20 px-4">
      <div className="mx-auto max-w-md space-y-2">
        {status ? (
          <p className="text-center text-[12px] font-medium text-white/80">
            {status}
          </p>
        ) : null}

        <div className="space-y-2">
          {latest.map((m) => (
            <div
              key={m.id}
              className={[
                "max-w-[88%] px-4 py-3 text-[15px] font-medium leading-snug",
                m.role === "user"
                  ? "ml-auto rounded-[30px] bg-[#111111] text-white"
                  : "mr-auto rounded-[24px] bg-white text-[#111111]",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))}
        </div>

        {pois.length > 0 ? (
          <div className="pointer-events-auto space-y-0 overflow-hidden rounded-none bg-white">
            <div className="border-b border-[#e5e5e5] px-4 py-2">
              <p className="nike-display text-[11px] text-[#111111]">NEARBY</p>
            </div>
            {pois.slice(0, 3).map((p, i) => (
              <a
                key={p.id}
                className={[
                  "block px-4 py-3",
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
                  <span className="text-[15px] font-medium text-[#111111]">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-[#707072]">
                    {p.distanceMeters != null ? `${p.distanceMeters}m` : ""}
                  </span>
                </div>
                <p className="mt-1 text-[12px] font-medium text-[#707072]">
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
