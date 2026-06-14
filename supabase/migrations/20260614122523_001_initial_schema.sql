-- Services: Temple seva/pooja offerings
CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  duration TEXT NOT NULL,
  priest TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_slots INTEGER NOT NULL DEFAULT 10,
  is_popular BOOLEAN DEFAULT FALSE,
  is_recommended BOOLEAN DEFAULT FALSE,
  image_gradient TEXT,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Priests: Temple priests
CREATE TABLE priests (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  specialty TEXT,
  ratings DECIMAL(2,1) DEFAULT 4.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory: Daily capacity and calendar overrides
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  capacity INTEGER NOT NULL DEFAULT 50,
  day_type TEXT NOT NULL DEFAULT 'Normal', -- Normal, Festival, Closed
  festival_name TEXT,
  waitlist_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings: Customer reservations
CREATE TABLE bookings (
  id TEXT PRIMARY KEY, -- e.g. SEVA-9847190
  devotee_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT,
  service_id INTEGER REFERENCES services(id),
  booking_date DATE NOT NULL,
  slot_time TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Confirmed, Completed, Cancelled
  priest TEXT,
  participants INTEGER DEFAULT 1,
  gotra TEXT,
  special_requests TEXT,
  payment_id TEXT, -- Razorpay payment ID
  order_id TEXT, -- Razorpay order ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications: User alerts
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  title TEXT NOT NULL,
  description TEXT,
  notification_time TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE priests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Services: Public read, admin write (service role)
CREATE POLICY "services_public_select" ON services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "services_admin_all" ON services FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Priests: Public read, admin write
CREATE POLICY "priests_public_select" ON priests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "priests_admin_all" ON priests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Inventory: Public read, admin write
CREATE POLICY "inventory_public_select" ON inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "inventory_admin_all" ON inventory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bookings: Public read/write (for now, simple approach)
CREATE POLICY "bookings_public_all" ON bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Notifications: Public read
CREATE POLICY "notifications_public_select" ON notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "notifications_public_insert" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Seed services
INSERT INTO services (name, category, duration, priest, price, max_slots, is_popular, is_recommended, image_gradient, icon) VALUES
('Sri Maha Ganpati Abhishek', 'Pooja', '45 mins', 'Pandit Shastri', 501.00, 15, true, false, 'linear-gradient(135deg, #FF9933 0%, #FF5500 100%)', 'sun'),
('Maha Mrityunjaya Havan Jaap', 'Ritual', '2 hours', 'Pandit Dwivedi', 2100.00, 5, false, true, 'linear-gradient(135deg, #E35205 0%, #8B0000 100%)', 'flame'),
('Vivah Sanskar (Marriage Ceremony)', 'Ceremony', '3 hours', 'Pandit Tiwari', 5001.00, 2, false, false, 'linear-gradient(135deg, #D4AF37 0%, #9A7B1C 100%)', 'heart'),
('VIP Quick Darshan Pass', 'VIP Darshan', '1 hour', 'N/A (Self)', 250.00, 80, true, false, 'linear-gradient(135deg, #FFE082 0%, #FFA000 100%)', 'ticket'),
('Grand Ashtami Shanti Pooja', 'Festival Service', '1.5 hours', 'Pandit Sharma', 1100.00, 30, false, true, 'linear-gradient(135deg, #FF7D3C 0%, #D4AF37 100%)', 'sparkles'),
('Family Satyanarayan Vrat Pooja', 'Group Booking', '1.5 hours', 'Pandit Joshi', 1500.00, 10, false, false, 'linear-gradient(135deg, #8B6508 0%, #2C2520 100%)', 'users');

-- Seed priests
INSERT INTO priests (name, status, specialty, ratings) VALUES
('Pandit Shastri', 'Available', 'Abhishek & Poojas', 4.9),
('Pandit Dwivedi', 'Active', 'Havans & Vedic Rituals', 4.8),
('Pandit Tiwari', 'Available', 'Ceremonies & Vivahs', 5.0),
('Pandit Sharma', 'Active', 'Festival Special Havans', 4.7),
('Pandit Joshi', 'On Leave', 'Vrat & Satyanarayan Path', 4.8);

-- Seed inventory for June 2026
INSERT INTO inventory (date, capacity, day_type, festival_name, waitlist_enabled) VALUES
('2026-06-15', 150, 'Festival', 'Nirjala Ekadashi', true),
('2026-06-20', 200, 'Festival', 'Ganga Dussehra', true),
('2026-06-25', 0, 'Closed', 'Grahana Closed (Solar Eclipse)', false);

-- Create index for faster booking lookups
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_email ON bookings(email);
CREATE INDEX idx_inventory_date ON inventory(date);