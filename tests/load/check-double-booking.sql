-- Run after a load test (psql "$DATABASE_URL" -f tests/load/check-double-booking.sql). Must return 0 rows:
-- no seat may be in more than one paid/comp booking.
SELECT seat_id
  FROM booking_items bi
  JOIN bookings b ON b.id = bi.booking_id
 WHERE b.status IN ('paid','comp','pending')
 GROUP BY seat_id
HAVING count(*) FILTER (WHERE b.status IN ('paid','comp')) > 1;
