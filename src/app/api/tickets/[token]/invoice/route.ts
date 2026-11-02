import { generateInvoicePdf } from "@/server/tickets/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-page payment receipt PDF; the access token in the URL is the only auth. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const pdf = await generateInvoicePdf(token);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"receipt.pdf\"",
      "Cache-Control": "no-store",
    },
  });
}
