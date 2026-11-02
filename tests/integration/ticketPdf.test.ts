import { beforeEach, expect, test } from "vitest";
import { GET as invoiceRoute } from "@/app/api/tickets/[token]/invoice/route";
import { GET as passRoute } from "@/app/api/tickets/[token]/pass/route";
import { generateInvoicePdf, generateTicketPassPdf } from "@/server/tickets/pdf";
import { confirmBooking } from "@/server/payments/confirmBooking";
import { guest, holdWithOrder } from "../helpers/holds";
import { seedVenue } from "../helpers/db";

const ORIGIN = "http://localhost:3000";
let seatIds: string[];

beforeEach(async () => {
  seatIds = (await seedVenue({ seatsPerTier: 2 })).seats.map((s) => s.id);
});

const isPdf = (buf: Buffer) =>
  buf.subarray(0, 5).toString("latin1") === "%PDF-" && buf.subarray(-16).toString("latin1").includes("%%EOF");

test("generateTicketPassPdf is null for a token that doesn't exist or isn't paid yet", async () => {
  expect(await generateTicketPassPdf("nope")).toBeNull();
  const h = await holdWithOrder([seatIds[0]], guest);
  expect(await generateTicketPassPdf(h.accessToken)).toBeNull(); // still pending
});

test("generateTicketPassPdf renders a valid PDF that grows with the seat count", async () => {
  const b1 = await holdWithOrder([seatIds[0]], guest);
  await confirmBooking({ orderId: b1.orderId, paymentId: `pay_${b1.orderId}`, amountPaise: b1.amountPaise });
  const onePage = await generateTicketPassPdf(b1.accessToken);
  expect(onePage).not.toBeNull();
  expect(isPdf(onePage!)).toBe(true);

  const b2 = await holdWithOrder([seatIds[2], seatIds[3]], guest);
  await confirmBooking({ orderId: b2.orderId, paymentId: `pay_${b2.orderId}`, amountPaise: b2.amountPaise });
  const twoPages = await generateTicketPassPdf(b2.accessToken);
  expect(isPdf(twoPages!)).toBe(true);
  expect(twoPages!.length).toBeGreaterThan(onePage!.length);
});

test("generateInvoicePdf renders a valid PDF for a paid booking, null otherwise", async () => {
  expect(await generateInvoicePdf("nope")).toBeNull();
  const b = await holdWithOrder([seatIds[0]], guest, undefined);
  expect(await generateInvoicePdf(b.accessToken)).toBeNull(); // still pending
  await confirmBooking({ orderId: b.orderId, paymentId: `pay_${b.orderId}`, amountPaise: b.amountPaise });
  const pdf = await generateInvoicePdf(b.accessToken);
  expect(isPdf(pdf!)).toBe(true);
});

test("GET /api/tickets/[token]/pass and /invoice serve a PDF, 404 for unknown tokens", async () => {
  const b = await holdWithOrder([seatIds[0]], guest);
  await confirmBooking({ orderId: b.orderId, paymentId: `pay_${b.orderId}`, amountPaise: b.amountPaise });

  const passRes = await passRoute(new Request(`${ORIGIN}/api/tickets/${b.accessToken}/pass`), {
    params: Promise.resolve({ token: b.accessToken }),
  });
  expect(passRes.status).toBe(200);
  expect(passRes.headers.get("content-type")).toBe("application/pdf");
  expect(isPdf(Buffer.from(await passRes.arrayBuffer()))).toBe(true);

  const invoiceRes = await invoiceRoute(new Request(`${ORIGIN}/api/tickets/${b.accessToken}/invoice`), {
    params: Promise.resolve({ token: b.accessToken }),
  });
  expect(invoiceRes.status).toBe(200);
  expect(isPdf(Buffer.from(await invoiceRes.arrayBuffer()))).toBe(true);

  const missing = await passRoute(new Request(`${ORIGIN}/api/tickets/nope/pass`), {
    params: Promise.resolve({ token: "nope" }),
  });
  expect(missing.status).toBe(404);
});
