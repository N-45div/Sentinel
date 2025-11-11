"use client";

import Image from "next/image";
import visaPng from "@/svg/visa.png";
import x402Png from "@/svg/x402-button-medium.png";
import xmcpPng from "@/svg/xmcp.png";

type Logo = { src: any; alt: string };

const LOGOS: Logo[] = [
  { src: visaPng, alt: "Visa" },
  { src: x402Png, alt: "x402" },
  { src: xmcpPng, alt: "Model Context Protocol (XMCP)" },
];

export default function Marquee() {
  return (
    <div className="w-full py-6" id="tech">
      <div className="mb-4 text-center text-xs uppercase tracking-wider text-white/60">
        Powered by
      </div>
      <div className="flex flex-wrap items-center justify-center gap-10">
        {LOGOS.map((item, i) => (
          <div key={`${item.alt}-${i}`} title={item.alt} className="shrink-0">
            <Image
              src={item.src}
              alt={item.alt}
              className="h-12 w-auto md:h-14"
              sizes="(max-width: 768px) 160px, 220px"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
