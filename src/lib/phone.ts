/** Normalises an Indian mobile number to `+91XXXXXXXXXX`, or returns null if it is not valid. */
export function normalizeIndianPhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, "");
  let digits: string;
  if (cleaned.startsWith("+91")) digits = cleaned.slice(3);
  else if (cleaned.startsWith("+")) return null;
  else if (/^91\d{10}$/.test(cleaned)) digits = cleaned.slice(2);
  else if (/^0\d{10}$/.test(cleaned)) digits = cleaned.slice(1);
  else digits = cleaned;
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
