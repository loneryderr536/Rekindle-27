import { expect, test } from "vitest";
import { bookingStatus } from "@/db/schema";
import { ticketsVisible } from "@/server/tickets/visibility";

test("tickets are visible only for paid and comp, across every booking status", () => {
  const visible = Object.fromEntries(bookingStatus.enumValues.map((s) => [s, ticketsVisible(s)]));
  expect(visible).toEqual({
    pending: false, paid: true, expired: false, comp: true, refund_due: false, refunded: false,
  });
});
