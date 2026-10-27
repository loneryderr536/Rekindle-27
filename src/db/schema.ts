import { sql } from "drizzle-orm";
import {
  boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

export const seatStatus = pgEnum("seat_status", ["available", "held", "sold", "blocked"]);
export const bookingStatus = pgEnum("booking_status", ["pending", "paid", "expired", "comp", "refund_due", "refunded", "cancelled"]);
export const adminRole = pgEnum("admin_role", ["admin", "scanner"]);
export const outboxKind = pgEnum("outbox_kind", ["tickets", "refund_notice", "cancellation"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const tstz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tstz("created_at").notNull().defaultNow();

export const tiers = pgTable(
  "tiers",
  {
    id: id(),
    name: text("name").notNull().unique(),
    pricePaise: integer("price_paise").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [check("tiers_price_paise_positive", sql`${t.pricePaise} > 0`)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    publicCode: text("public_code").notNull().unique(),
    accessToken: text("access_token").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    clientIp: text("client_ip"),
    status: bookingStatus("status").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    /** Seat total before any discount; null on bookings made before discount codes existed. */
    subtotalPaise: integer("subtotal_paise"),
    discountPaise: integer("discount_paise").notNull().default(0),
    discountCode: text("discount_code"),
    seatCount: integer("seat_count").notNull(),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    refundAmountPaise: integer("refund_amount_paise"),
    holdExpiresAt: tstz("hold_expires_at").notNull(),
    paidAt: tstz("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("bookings_amount_paise_nonneg", sql`${t.amountPaise} >= 0`),
    check("bookings_refund_amount_paise_nonneg", sql`${t.refundAmountPaise} >= 0`),
    check("bookings_discount_paise_nonneg", sql`${t.discountPaise} >= 0`),
    index("bookings_discount_code_idx").on(t.discountCode),
  ],
);

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: id(),
    /** Normalised: upper-case letters and digits only, e.g. "REKINDLE10". */
    code: text("code").notNull().unique(),
    percent: integer("percent").notNull(),
    active: boolean("active").notNull().default(true),
    maxUses: integer("max_uses"),
    expiresAt: tstz("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [
    // Below 100: Razorpay cannot create a zero-amount order.
    check("discount_codes_percent_range", sql`${t.percent} BETWEEN 1 AND 99`),
    check("discount_codes_max_uses_positive", sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
  ],
);

export const seats = pgTable(
  "seats",
  {
    id: id(),
    label: text("label").notNull().unique(),
    section: text("section").notNull(),
    row: text("row").notNull(),
    number: integer("number").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    tierId: uuid("tier_id").notNull().references(() => tiers.id),
    status: seatStatus("status").notNull().default("available"),
    bookingId: uuid("booking_id").references(() => bookings.id),
    heldUntil: tstz("held_until"),
    version: integer("version").notNull().default(0),
  },
  (t) => [index("seats_status_held_until_idx").on(t.status, t.heldUntil)],
);

export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    seatId: uuid("seat_id").notNull().references(() => seats.id),
    tierName: text("tier_name").notNull(),
    pricePaise: integer("price_paise").notNull(),
  },
  (t) => [check("booking_items_price_paise_nonneg", sql`${t.pricePaise} >= 0`)],
);

export const adminUsers = pgTable("admin_users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull(),
  createdAt: createdAt(),
});

export const tickets = pgTable("tickets", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  seatId: uuid("seat_id").notNull().unique().references(() => seats.id),
  token: text("token").notNull().unique(),
  checkedInAt: tstz("checked_in_at"),
  checkedInBy: uuid("checked_in_by").references(() => adminUsers.id),
  gate: text("gate"),
});

export const adminSessions = pgTable("admin_sessions", {
  id: text("id").primaryKey(),
  adminUserId: uuid("admin_user_id").notNull().references(() => adminUsers.id),
  expiresAt: tstz("expires_at").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: createdAt(),
});

export const emailOutbox = pgTable("email_outbox", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  kind: outboxKind("kind").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  sentAt: tstz("sent_at"),
});

export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  razorpayEventId: text("razorpay_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: tstz("received_at").notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: tstz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export type Tier = typeof tiers.$inferSelect;
export type Seat = typeof seats.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
