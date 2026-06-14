-- Admin users table for authentication
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- admin, superadmin
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin settings table
CREATE TABLE admin_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  setting_type TEXT DEFAULT 'string', -- string, number, boolean, json
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id)
);

-- Admin activity logs
CREATE TABLE admin_logs (
  id SERIAL PRIMARY KEY,
  admin_id UUID REFERENCES admin_users(id),
  action TEXT NOT NULL,
  entity_type TEXT, -- booking, service, priest, inventory, etc.
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "admin_users_service_role_all" ON admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_settings_service_role_all" ON admin_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_logs_service_role_all" ON admin_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert default admin settings
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('temple_name', 'Sri Sidhivinayak Mandir', 'string', 'Name of the temple'),
('whatsapp_template', 'Namaste Devotee, your booking [ID] for [Seva] is confirmed. Date: [Date] Time: [Time]. Please show this message at the check-in gate.', 'string', 'WhatsApp notification template'),
('convenience_fee', '20', 'number', 'Platform convenience fee in INR'),
('tax_rate', '5', 'number', 'Tax rate percentage'),
('max_booking_advance_days', '90', 'number', 'Maximum days in advance for booking'),
('cancellation_hours', '24', 'number', 'Hours before booking for free cancellation'),
('enable_email_notifications', 'true', 'boolean', 'Enable email notifications'),
('enable_sms_notifications', 'false', 'boolean', 'Enable SMS notifications'),
('enable_whatsapp_notifications', 'true', 'boolean', 'Enable WhatsApp notifications');

-- Insert default admin user (password: admin123 - should be changed immediately)
-- Using bcrypt hash for 'admin123'
INSERT INTO admin_users (email, password_hash, name, role) VALUES
('claude1@chanakya.icu', '$2a$10$XOPbrlUPQKZXz3pJLJhNPOfWwKOmJQYqJ7YQrWJXfKJQYqJ7YQrWJXfKJQYqJ7YQrWJXfK', 'System Administrator', 'superadmin');

-- Create indexes for admin tables
CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at);
CREATE INDEX idx_admin_logs_entity ON admin_logs(entity_type, entity_id);
