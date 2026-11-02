import { generateTicketPassPdf } from "@/server/tickets/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multi-page PDF ticket pass, one page per seat; the access token in the URL is the only auth. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const pdf = await generateTicketPassPdf(token);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"tickets.pdf\"",
      "Cache-Control": "no-store",
    },
  });
}
