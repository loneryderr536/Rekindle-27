CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"percent" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_codes_percent_range" CHECK ("discount_codes"."percent" BETWEEN 1 AND 99),
	CONSTRAINT "discount_codes_max_uses_positive" CHECK ("discount_codes"."max_uses" IS NULL OR "discount_codes"."max_uses" > 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "subtotal_paise" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount_code" text;--> statement-breakpoint
CREATE INDEX "bookings_discount_code_idx" ON "bookings" USING btree ("discount_code");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_paise_nonneg" CHECK ("bookings"."discount_paise" >= 0);
--> statement-breakpoint
INSERT INTO "discount_codes" ("code", "percent") VALUES ('REKINDLE10', 10), ('REKINDLE20', 20);
