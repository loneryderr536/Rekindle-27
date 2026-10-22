import { z } from "zod";

const gate = z.string().trim().min(1).max(40);

export const ScanInput = z.object({ payload: z.string().max(200), gate });
export const CheckInInput = z.object({ ticketId: z.uuid(), gate });
export const SearchQuery = z.string().trim().min(2).max(40);
