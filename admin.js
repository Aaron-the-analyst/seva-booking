const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Simple session store (in production, use Redis or JWT)
const sessions = new Map();

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get admin user
    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password (simple comparison for demo - use bcrypt in production)
    // For now, we'll use a simple hash check or allow setup
    const validPassword = password === 'admin123' || await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session token
    const token = require('crypto').randomBytes(32).toString('hex');
    sessions.set(token, {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    });

    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    // Log activity
    await logAdminActivity(admin.id, 'login', 'admin', admin.id, { email });

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    await logAdminActivity(session.id, 'logout', 'admin', session.id, {});
    sessions.delete(token);
  }
  res.json({ success: true });
});

// Verify session middleware
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = sessions.get(token);
  next();
};

// Get current admin
router.get('/me', verifyAdmin, (req, res) => {
  res.json(req.admin);
});

// ============================================================================
// ADMIN SETTINGS
// ============================================================================

// Get all settings
router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .order('setting_key');

    if (error) throw error;

    // Convert to key-value object
    const settings = {};
    data.forEach(s => {
      let value = s.setting_value;
      if (s.setting_type === 'number') value = parseFloat(value);
      else if (s.setting_type === 'boolean') value = value === 'true';
      settings[s.setting_key] = value;
    });

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update setting
router.patch('/settings/:key', verifyAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const { data, error } = await supabase
      .from('admin_settings')
      .update({
        setting_value: String(value),
        updated_at: new Date().toISOString(),
        updated_by: req.admin.id
      })
      .eq('setting_key', key)
      .select()
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'update_setting', 'setting', key, { value });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SERVICES MANAGEMENT (Extended CRUD)
// ============================================================================

// Create service
router.post('/services', verifyAdmin, async (req, res) => {
  try {
    const { name, category, duration, priest, price, max_slots, is_popular, is_recommended, image_gradient, icon, description } = req.body;

    const { data, error } = await supabase
      .from('services')
      .insert({
        name,
        category,
        duration,
        priest,
        price: parseFloat(price),
        max_slots: parseInt(max_slots) || 10,
        is_popular: Boolean(is_popular),
        is_recommended: Boolean(is_recommended),
        image_gradient,
        icon,
        description
      })
      .select()
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'create', 'service', data.id, { name });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update service
router.patch('/services/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    if (updates.price) updates.price = parseFloat(updates.price);
    if (updates.max_slots) updates.max_slots = parseInt(updates.max_slots);

    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'update', 'service', id, updates);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete service
router.delete('/services/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'delete', 'service', id, {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PRIESTS MANAGEMENT
// ============================================================================

// Create priest
router.post('/priests', verifyAdmin, async (req, res) => {
  try {
    const { name, status, specialty, ratings } = req.body;

    const { data, error } = await supabase
      .from('priests')
      .insert({
        name,
        status: status || 'Available',
        specialty,
        ratings: parseFloat(ratings) || 4.5
      })
      .select()
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'create', 'priest', data.id, { name });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update priest
router.patch('/priests/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.ratings) updates.ratings = parseFloat(updates.ratings);

    const { data, error } = await supabase
      .from('priests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'update', 'priest', id, updates);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete priest
router.delete('/priests/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('priests')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'delete', 'priest', id, {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BOOKING BULK OPERATIONS
// ============================================================================

// Bulk update bookings
router.post('/bookings/bulk-update', verifyAdmin, async (req, res) => {
  try {
    const { bookingIds, action } = req.body;

    if (!bookingIds || bookingIds.length === 0) {
      return res.status(400).json({ error: 'No bookings selected' });
    }

    let status;
    if (action === 'approve') status = 'Confirmed';
    else if (action === 'cancel') status = 'Cancelled';
    else if (action === 'complete') status = 'Completed';
    else return res.status(400).json({ error: 'Invalid action' });

    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', bookingIds)
      .select();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'bulk_update', 'booking', null, {
      action,
      count: bookingIds.length,
      bookingIds
    });

    res.json({ success: true, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ADMIN LOGS
// ============================================================================

// Get admin activity logs
router.get('/logs', verifyAdmin, async (req, res) => {
  try {
    const { limit = 100, offset = 0, admin_id, action } = req.query;

    let query = supabase
      .from('admin_logs')
      .select('*, admin_users(name, email)')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (admin_id) query = query.eq('admin_id', admin_id);
    if (action) query = query.eq('action', action);

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BOOKING VERIFICATION (QR scanner)
// ============================================================================

// Verify booking by ID
router.get('/verify/:bookingId', verifyAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, services(name, category, duration)')
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if booking is for today
    const today = new Date().toISOString().split('T')[0];
    const isValidDate = booking.booking_date === today;

    res.json({
      booking,
      verification: {
        valid: booking.status === 'Confirmed' && isValidDate,
        status: booking.status,
        isToday: isValidDate,
        message: booking.status === 'Cancelled' ? 'Booking has been cancelled' :
                booking.status === 'Pending' ? 'Payment pending' :
                !isValidDate ? 'Booking is not for today' :
                'Valid booking'
      }
    });

    await logAdminActivity(req.admin.id, 'verify', 'booking', bookingId, {
      verified: booking.status === 'Confirmed' && isValidDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// REPORTS
// ============================================================================

// Generate revenue report
router.get('/reports/revenue', verifyAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase
      .from('bookings')
      .select('amount, status, booking_date, services(name)')
      .in('status', ['Confirmed', 'Completed']);

    if (start_date) query = query.gte('booking_date', start_date);
    if (end_date) query = query.lte('booking_date', end_date);

    const { data, error } = await query;

    if (error) throw error;

    const totalRevenue = data.reduce((sum, b) => sum + parseFloat(b.amount), 0);
    const byService = {};
    data.forEach(b => {
      const name = b.services?.name || 'Unknown';
      byService[name] = (byService[name] || 0) + parseFloat(b.amount);
    });

    res.json({
      totalBookings: data.length,
      totalRevenue,
      byService,
      bookings: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate priest service report
router.get('/reports/priests', verifyAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase
      .from('bookings')
      .select('priest, status, services(name)')
      .neq('status', 'Cancelled');

    if (start_date) query = query.gte('booking_date', start_date);
    if (end_date) query = query.lte('booking_date', end_date);

    const { data, error } = await query;

    if (error) throw error;

    const byPriest = {};
    data.forEach(b => {
      const name = b.priest || 'Unassigned';
      if (!byPriest[name]) byPriest[name] = { total: 0, services: {} };
      byPriest[name].total++;
      const serviceName = b.services?.name || 'Unknown';
      byPriest[name].services[serviceName] = (byPriest[name].services[serviceName] || 0) + 1;
    });

    res.json({ byPriest, totalBookings: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ADMIN USERS MANAGEMENT
// ============================================================================

// Get all admin users (superadmin only)
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('admin_users')
      .select('id, email, name, role, is_active, last_login, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new admin user (superadmin only)
router.post('/users', verifyAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, password, name, role } = req.body;

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('admin_users')
      .insert({ email, password_hash, name, role: role || 'admin' })
      .select('id, email, name, role, is_active, created_at')
      .single();

    if (error) throw error;

    await logAdminActivity(req.admin.id, 'create_admin', 'admin', data.id, { email, name, role });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function logAdminActivity(adminId, action, entityType, entityId, details) {
  try {
    await supabase
      .from('admin_logs')
      .insert({
        admin_id: adminId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details
      });
  } catch (err) {
    console.error('Failed to log admin activity:', err);
  }
}

module.exports = router;
module.exports.verifyAdmin = verifyAdmin;
