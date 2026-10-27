import { z } from "zod";
import { MAX_SEATS_PER_BOOKING } from "@/lib/constants";
import { normalizeIndianPhone } from "@/lib/phone";

export const HoldInput = z.object({
  seatIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS_PER_BOOKING),
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  phone: z
    .string()
    .refine((p) => normalizeIndianPhone(p) !== null, "Invalid Indian mobile number")
    .transform((p) => normalizeIndianPhone(p)!),
  discountCode: z.string().trim().max(40).optional(),
  turnstileToken: z.string(),
});

export type HoldInputT = z.infer<typeof HoldInput>;
