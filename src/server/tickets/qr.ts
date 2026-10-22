import QRCode from "qrcode";

/** Renders a QR payload as a PNG. */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
}

/** Renders a QR payload as a `data:image/png;base64,…` URL (for the booking page). */
export function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 320 });
}
