const express = require('express');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { getDb } = require('./db');
const { getNextSequence } = require('./api');

// Simple session store (in production, use Redis or JWT)
const sessions = new Map();

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

// Admin login
router.post('/login', async (req, res) => {
  try {
    const db = await getDb();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get admin user
    const admin = await db.collection('admin_users').findOne({ email, is_active: true });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password (simple comparison for demo - use bcrypt in production)
    const validPassword = password === 'admin123' || await bcrypt.compare(password, admin.password_hash || '');

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
    await db.collection('admin_users').updateOne(
      { id: admin.id },
      { $set: { last_login: new Date().toISOString() } }
    );

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
    const db = await getDb();
    const data = await db.collection('admin_settings').find({}).sort({ setting_key: 1 }).toArray();

    // Convert to key-value object
    const settings = {};
    data.forEach(s => {
      let value = s.setting_value;
      if (s.setting_type === 'number') value = parseFloat(value);
      else if (s.setting_type === 'boolean') value = value === 'true' || value === true;
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
    const db = await getDb();
    const { key } = req.params;
    const { value } = req.body;

    const result = await db.collection('admin_settings').findOneAndUpdate(
      { setting_key: key },
      {
        $set: {
          setting_value: String(value),
          updated_at: new Date().toISOString(),
          updated_by: req.admin.id
        }
      },
      { returnDocument: 'after', upsert: true }
    );

    await logAdminActivity(req.admin.id, 'update_setting', 'setting', key, { value });

    res.json(result);
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
    const db = await getDb();
    const { name, category, duration, priest, price, max_slots, is_popular, is_recommended, image_gradient, icon, description } = req.body;

    const id = await getNextSequence(db, 'services');

    const doc = {
      id,
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
      description,
      created_at: new Date().toISOString()
    };

    await db.collection('services').insertOne(doc);

    await logAdminActivity(req.admin.id, 'create', 'service', id, { name });

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update service
router.patch('/services/:id', verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    if (updates.price) updates.price = parseFloat(updates.price);
    if (updates.max_slots) updates.max_slots = parseInt(updates.max_slots);

    const result = await db.collection('services').findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Service not found' });

    await logAdminActivity(req.admin.id, 'update', 'service', id, updates);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete service
router.delete('/services/:id', verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);

    await db.collection('services').deleteOne({ id });

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
    const db = await getDb();
    const { name, status, specialty, ratings } = req.body;

    const id = await getNextSequence(db, 'priests');

    const doc = {
      id,
      name,
      status: status || 'Available',
      specialty,
      ratings: parseFloat(ratings) || 4.5,
      created_at: new Date().toISOString()
    };

    await db.collection('priests').insertOne(doc);

    await logAdminActivity(req.admin.id, 'create', 'priest', id, { name });

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update priest
router.patch('/priests/:id', verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    const updates = { ...req.body };

    if (updates.ratings) updates.ratings = parseFloat(updates.ratings);

    const result = await db.collection('priests').findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Priest not found' });

    await logAdminActivity(req.admin.id, 'update', 'priest', id, updates);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete priest
router.delete('/priests/:id', verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);

    await db.collection('priests').deleteOne({ id });

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
    const db = await getDb();
    const { bookingIds, action } = req.body;

    if (!bookingIds || bookingIds.length === 0) {
      return res.status(400).json({ error: 'No bookings selected' });
    }

    let status;
    if (action === 'approve') status = 'Confirmed';
    else if (action === 'cancel') status = 'Cancelled';
    else if (action === 'complete') status = 'Completed';
    else return res.status(400).json({ error: 'Invalid action' });

    const result = await db.collection('bookings').updateMany(
      { id: { $in: bookingIds } },
      { $set: { status, updated_at: new Date().toISOString() } }
    );

    await logAdminActivity(req.admin.id, 'bulk_update', 'booking', null, {
      action,
      count: bookingIds.length,
      bookingIds
    });

    res.json({ success: true, count: result.modifiedCount });
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
    const db = await getDb();
    const { limit = 100, offset = 0, admin_id, action } = req.query;

    const filter = {};
    if (admin_id) filter.admin_id = admin_id;
    if (action) filter.action = action;

    const logs = await db.collection('admin_logs')
      .find(filter)
      .sort({ created_at: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    // Manually join admin name/email
    const adminIds = [...new Set(logs.map(l => l.admin_id))];
    const admins = await db.collection('admin_users').find({ id: { $in: adminIds } }).toArray();
    const adminMap = {};
    admins.forEach(a => { adminMap[a.id] = a; });

    const result = logs.map(l => ({
      ...l,
      admin_users: adminMap[l.admin_id]
        ? { name: adminMap[l.admin_id].name, email: adminMap[l.admin_id].email }
        : null
    }));

    res.json(result);
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
    const db = await getDb();
    const { bookingId } = req.params;

    const booking = await db.collection('bookings').findOne({ id: bookingId });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const service = await db.collection('services').findOne({ id: booking.service_id });

    // Check if booking is for today
    const today = new Date().toISOString().split('T')[0];
    const isValidDate = booking.booking_date === today;

    res.json({
      booking: {
        ...booking,
        services: service
          ? { name: service.name, category: service.category, duration: service.duration }
          : null
      },
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
    const db = await getDb();
    const { start_date, end_date } = req.query;

    const filter = { status: { $in: ['Confirmed', 'Completed'] } };
    if (start_date) filter.booking_date = { ...filter.booking_date, $gte: start_date };
    if (end_date) filter.booking_date = { ...filter.booking_date, $lte: end_date };

    const bookings = await db.collection('bookings').find(filter).toArray();

    const serviceIds = [...new Set(bookings.map(b => b.service_id))];
    const services = await db.collection('services').find({ id: { $in: serviceIds } }).toArray();
    const serviceMap = {};
    services.forEach(s => { serviceMap[s.id] = s.name; });

    const totalRevenue = bookings.reduce((sum, b) => sum + parseFloat(b.amount), 0);
    const byService = {};
    bookings.forEach(b => {
      const name = serviceMap[b.service_id] || 'Unknown';
      byService[name] = (byService[name] || 0) + parseFloat(b.amount);
    });

    const bookingsWithService = bookings.map(b => ({
      ...b,
      services: { name: serviceMap[b.service_id] || 'Unknown' }
    }));

    res.json({
      totalBookings: bookings.length,
      totalRevenue,
      byService,
      bookings: bookingsWithService
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate priest service report
router.get('/reports/priests', verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const { start_date, end_date } = req.query;

    const filter = { status: { $ne: 'Cancelled' } };
    if (start_date) filter.booking_date = { ...filter.booking_date, $gte: start_date };
    if (end_date) filter.booking_date = { ...filter.booking_date, $lte: end_date };

    const bookings = await db.collection('bookings').find(filter).toArray();

    const serviceIds = [...new Set(bookings.map(b => b.service_id))];
    const services = await db.collection('services').find({ id: { $in: serviceIds } }).toArray();
    const serviceMap = {};
    services.forEach(s => { serviceMap[s.id] = s.name; });

    const byPriest = {};
    bookings.forEach(b => {
      const name = b.priest || 'Unassigned';
      if (!byPriest[name]) byPriest[name] = { total: 0, services: {} };
      byPriest[name].total++;
      const serviceName = serviceMap[b.service_id] || 'Unknown';
      byPriest[name].services[serviceName] = (byPriest[name].services[serviceName] || 0) + 1;
    });

    res.json({ byPriest, totalBookings: bookings.length });
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

    const db = await getDb();
    const data = await db.collection('admin_users')
      .find({})
      .project({ id: 1, email: 1, name: 1, role: 1, is_active: 1, last_login: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .toArray();

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

    const db = await getDb();
    const { email, password, name, role } = req.body;

    const password_hash = await bcrypt.hash(password, 10);
    const id = await getNextSequence(db, 'admin_users');

    const doc = {
      id,
      email,
      password_hash,
      name,
      role: role || 'admin',
      is_active: true,
      created_at: new Date().toISOString()
    };

    await db.collection('admin_users').insertOne(doc);

    await logAdminActivity(req.admin.id, 'create_admin', 'admin', id, { email, name, role });

    const { password_hash: _, ...safeDoc } = doc;
    res.json(safeDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function logAdminActivity(adminId, action, entityType, entityId, details) {
  try {
    const db = await getDb();
    await db.collection('admin_logs').insertOne({
      admin_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log admin activity:', err);
  }
}

module.exports = router;
module.exports.verifyAdmin = verifyAdmin;
