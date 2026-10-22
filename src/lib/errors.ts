import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Converts any thrown value into a JSON `{ error: { code, message, details? } }` Response. */
export function jsonError(e: unknown): Response {
  if (e instanceof AppError) {
    const error = { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) };
    return Response.json({ error }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const message = e.issues
      .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    return Response.json({ error: { code: "VALIDATION", message } }, { status: 400 });
  }
  console.error(e);
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  );
}
