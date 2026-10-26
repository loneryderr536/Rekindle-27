ALTER TYPE "public"."booking_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'cancellation';