CREATE INDEX "booking_items_booking_id_idx" ON "booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "bookings_lower_email_idx" ON "bookings" USING btree (lower(trim("email")));--> statement-breakpoint
CREATE INDEX "email_outbox_booking_id_idx" ON "email_outbox" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "seats_section_row_number_idx" ON "seats" USING btree ("section","row","number");--> statement-breakpoint
CREATE INDEX "tickets_booking_id_idx" ON "tickets" USING btree ("booking_id");