"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

const REPEAT_MS = 3000;

/** Back-camera QR reader. Calls `onResult` once per distinct code (the same text is ignored for 3 s). */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onResult);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    handler.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    let last = { text: "", at: 0 };

    new BrowserQRCodeReader()
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current ?? undefined, (result) => {
        if (!result) return;
        const text = result.getText();
        const now = Date.now();
        if (text === last.text && now - last.at < REPEAT_MS) return;
        last = { text, at: now };
        handler.current(text);
      })
      .then((c) => {
        if (stopped) c.stop();
        else controls = c;
      })
      .catch((e: unknown) => {
        if (stopped) return;
        const name = e instanceof Error ? e.name : "";
        setProblem(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera permission was denied. Allow camera access for this site in your browser settings, then reload."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this device. Use the manual search below."
              : "The camera could not be started. Camera access needs a secure (HTTPS) connection.",
        );
      });

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  if (problem) {
    return (
      <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-danger">
        {problem}
      </p>
    );
  }
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className="aspect-square w-full rounded-xl bg-plum object-cover"
      aria-label="Camera view for scanning ticket QR codes"
    />
  );
}
