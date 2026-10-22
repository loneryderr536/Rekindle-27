import { AppError } from "@/lib/errors";

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON", 400);
  }
}
