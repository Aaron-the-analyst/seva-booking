-- Drop the overly permissive policies
DROP POLICY IF EXISTS "bookings_public_all" ON bookings;
DROP POLICY IF EXISTS "notifications_public_select" ON notifications;
DROP POLICY IF EXISTS "notifications_public_insert" ON notifications;

-- Bookings: Proper RLS policies
-- Public can insert new bookings (anyone can make a reservation)
CREATE POLICY "bookings_public_insert" ON bookings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Public can view bookings (needed for lookup by booking ID and customer dashboard)
-- In production, you'd filter by email or phone supplied in the request
CREATE POLICY "bookings_public_select" ON bookings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role (backend API) can update or delete bookings
-- This ensures booking modifications go through the authenticated API
CREATE POLICY "bookings_service_update" ON bookings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bookings_service_delete" ON bookings FOR DELETE
  TO service_role
  USING (true);

-- Notifications: Proper RLS policies
-- Public can view notifications (for customer dashboard)
CREATE POLICY "notifications_public_select" ON notifications FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role (backend API) can insert or update notifications
-- Notifications are created and managed by the system, not directly by users
CREATE POLICY "notifications_service_insert" ON notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "notifications_service_update" ON notifications FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);