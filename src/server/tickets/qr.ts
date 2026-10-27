import QRCode from "qrcode";

/** Renders a QR payload as a PNG. */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
}

/**
 * Renders a QR payload as a `data:image/png;base64,…` URL (for the booking page). Navy on cream to match the
 * ticket; `width` is large enough that the downloaded PNG prints and scans cleanly.
 */
export function qrDataUrl(payload: string, width = 640): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M", margin: 2, width, color: { dark: "#0B1020", light: "#FDFBF4" },
  });
}
