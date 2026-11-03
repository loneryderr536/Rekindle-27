import QRCode from "qrcode";

/** Renders a QR payload as a PNG. */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
}

/**
 * Renders a QR payload as a PNG, navy on cream to match the ticket card (for the booking page's QR
 * image endpoint, so the browser/CDN can cache it instead of the server inlining a base64 copy into
 * the page's HTML on every render). `width` is large enough that a saved copy prints and scans cleanly.
 */
export function qrPngStyled(payload: string, width = 640): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png", errorCorrectionLevel: "M", margin: 2, width, color: { dark: "#0B1020", light: "#FDFBF4" },
  });
}
