"use client";

import { useState } from "react";
import { whatsappShare } from "@/lib/format";
import { buttonClass } from "./ui";

export function ShareButtons({ url, text, copyLabel = "Copy link" }: { url: string; text: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={whatsappShare(`${text} ${url}`)} target="_blank" rel="noopener noreferrer" className={buttonClass("success", "md", true)}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2Z" />
        </svg>
        WhatsApp
      </a>
      <button
        type="button"
        className={buttonClass("outline", "md", true)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy this link:", url);
          }
        }}
      >
        {copied ? "Copied!" : copyLabel}
      </button>
    </div>
  );
}
