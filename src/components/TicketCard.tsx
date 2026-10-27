"use client";

import { useState, type PointerEvent } from "react";

type Props = {
  qr: string;
  seatLabel: string;
  tierName: string;
  orderCode: string;
  holder: string;
  eventName: string;
  shortDate: string;
  longDate: string;
  hallLine: string;
  gatesOpen: string;
};

const GLASS = "linear-gradient(160deg, rgba(255, 122, 46, 0.55) 0%, rgba(184, 50, 15, 0.45) 35%, rgba(10, 84, 112, 0.55) 100%)";
const NOTCH = "radial-gradient(circle at 0 204px, #0000 14px, #000 14.5px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 204px, #0000 14px, #000 14.5px) right / 51% 100% no-repeat";
const LOGO = "/landing/logo.png";

/** One digital ticket: the floating holographic card with its entry QR, and the details plate under it. */
export function TicketCard({ qr, seatLabel, tierName, orderCode, holder, eventName, shortDate, longDate, hallLine, gatesOpen }: Props) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const { x: tx, y: ty } = tilt;

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  }

  const holo = `radial-gradient(circle at ${(50 + tx * 40).toFixed(0)}% ${(40 + ty * 40).toFixed(0)}%, rgba(253, 251, 244, 0.55) 0%, rgba(249, 169, 11, 0.25) 25%, rgba(26, 138, 168, 0.2) 50%, rgba(255, 69, 32, 0) 70%)`;
  const logoHolo = `linear-gradient(${(120 + tx * 60).toFixed(0)}deg, rgba(255, 69, 32, 0) 20%, rgba(255, 236, 170, 0.28) ${(45 + tx * 15).toFixed(0)}%, rgba(120, 220, 240, 0.18) ${(60 + ty * 15).toFixed(0)}%, rgba(253, 251, 244, 0) 85%)`;
  // Labels are "section-row-number" (N-D-6); the ticket shows the seat as the guest finds it: D6.
  const seatShort = seatLabel.split("-").slice(1).join("") || seatLabel;
  const file = `${orderCode}-${seatLabel}`.replace(/[^A-Za-z0-9_-]+/g, "-");

  return (
    <article aria-label={`Ticket for seat ${seatLabel}`} className="flex flex-col items-center">
      <div className="relative mt-4" style={{ width: 250, height: 390 }}>
        <div aria-hidden="true" className="tk-shadow" style={{ position: "absolute", left: 30, right: 30, bottom: -26, height: 22, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255, 90, 20, 0.55), rgba(255, 90, 20, 0) 70%)" }} />
        <div className="tk-float" style={{ position: "absolute", inset: 0 }}>
          <div
            onPointerMove={onMove}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}
            style={{ position: "absolute", inset: 0, transition: "transform .25s ease-out", transform: `perspective(900px) rotateX(${(-ty * 12).toFixed(2)}deg) rotateY(${(tx * 14).toFixed(2)}deg)`, transformStyle: "preserve-3d" }}
          >
            <div className="tk-card" style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden", background: GLASS, backdropFilter: "blur(14px)", mask: NOTCH, WebkitMask: NOTCH }}>
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: holo, mixBlendMode: "screen", opacity: 0.55, transition: "background .25s" }} />
              <div style={{ position: "relative", margin: "14px auto 0", width: 108, height: 123, transform: `translate(${(tx * 6).toFixed(1)}px, ${(ty * 5).toFixed(1)}px)`, transition: "transform .25s ease-out" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- animated glow filter on a static brand asset */}
                <img className="lg-glow" src={LOGO} alt={`ONE·26 ${eventName}`} width={108} height={123} style={{ display: "block", width: 108, height: 123 }} />
                <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", mask: `url(${LOGO}) center / contain no-repeat`, WebkitMask: `url(${LOGO}) center / contain no-repeat` }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0) 38%)", mixBlendMode: "overlay" }} />
                  <div style={{ position: "absolute", inset: 0, background: logoHolo, mixBlendMode: "screen", transition: "background .25s" }} />
                  <div className="lg-shine" style={{ position: "absolute", top: "-20%", left: 0, width: "45%", height: "140%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.85) 50%, rgba(255, 255, 255, 0) 100%)" }} />
                </div>
              </div>
              <div style={{ position: "relative", padding: "10px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", height: 46, boxSizing: "border-box" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
                  <span aria-hidden="true" className="tk-pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "#3FE0A0", boxShadow: "0 0 10px #3FE0A0" }} />
                  Active
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{shortDate}</span>
              </div>
              <div aria-hidden="true" style={{ position: "relative", margin: "18px 18px 0", borderTop: "2px dashed rgba(253, 251, 244, 0.45)" }} />
              <div style={{ position: "relative", margin: "20px auto 0", width: 150, height: 150 }}>
                <svg aria-hidden="true" viewBox="0 0 150 150" width="150" height="150" style={{ position: "absolute", inset: 0 }}>
                  <path d="M2 26 V8 a6 6 0 0 1 6 -6 H26 M124 2 H142 a6 6 0 0 1 6 6 V26 M148 124 V142 a6 6 0 0 1 -6 6 H124 M26 148 H8 a6 6 0 0 1 -6 -6 V124" fill="none" stroke="#FDFBF4" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated on the server */}
                <img src={qr} alt={`QR code for seat ${seatLabel}`} width={116} height={116} style={{ position: "absolute", left: 17, top: 17, width: 116, height: 116, padding: 6, boxSizing: "border-box", borderRadius: 8, background: "#FDFBF4", display: "block" }} />
              </div>
              <div aria-hidden="true" className="tk-sheen" style={{ position: "absolute", top: "-20%", left: 0, width: "38%", height: "140%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", pointerEvents: "none" }} />
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: 20, boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 0 0 1px rgba(253, 251, 244, 0.25)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex w-full max-w-[342px] flex-col items-center gap-2 rounded-[28px] border border-[#FDFBF4]/20 bg-[#0B1020]/55 px-5 py-3.5 text-center backdrop-blur-md">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[#C9CCD8]">Seat · {tierName}</span>
          <span className="font-display text-[21px] font-semibold text-[#F9A90B]">{seatShort}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[#C9CCD8]">{hallLine}</span>
          <span className="font-display text-[21px] font-semibold">{longDate}</span>
          <span className="text-xs text-[#C9CCD8]">Gates open {gatesOpen}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[#C9CCD8]">Order number</span>
          <span className="font-display text-[21px] font-semibold tracking-[1px]">{orderCode}</span>
        </div>
        <span className="text-xs text-[#C9CCD8]">{holder}</span>
        <a
          href={qr}
          download={`${file}.png`}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#F9A90B] px-6 py-2.5 font-display text-base font-semibold text-[#0B1020] shadow-[0_0_24px_rgba(249,169,11,0.45)] transition-transform hover:scale-105"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
          Download QR
        </a>
      </div>
    </article>
  );
}
