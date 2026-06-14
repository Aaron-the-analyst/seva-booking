const express = require('express');
const router = express.Router();
const { getDb } = require('./db');

// Generate unique booking ID
function generateBookingId() {
  const num = Math.floor(Math.random() * 9000000) + 1000000;
  return `SEVA-${num}`;
}

// Get next numeric id for a collection (mimics SQL auto-increment)
async function getNextSequence(db, name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

// ============================================================================
// SERVICES
// ============================================================================

router.get('/services', async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection('services').find({}).sort({ id: 1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection('services').findOne({ id: parseInt(req.params.id) });
    if (!data) return res.status(404).json({ error: 'Service not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PRIESTS
// ============================================================================

router.get('/priests', async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection('priests').find({}).sort({ id: 1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// INVENTORY
// ============================================================================

router.get('/inventory', async (req, res) => {
  try {
    const db = await getDb();
    const { month, year } = req.query;
    const filter = {};

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const endDateStr = endDate.toISOString().split('T')[0];
      filter.date = { $gte: startDate, $lte: endDateStr };
    }

    const data = await db.collection('inventory').find(filter).sort({ date: 1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inventory', async (req, res) => {
  try {
    const db = await getDb();
    const { date, capacity, day_type, festival_name, waitlist_enabled } = req.body;

    const update = {
      date,
      capacity: parseInt(capacity),
      day_type,
      festival_name,
      waitlist_enabled
    };

    await db.collection('inventory').updateOne(
      { date },
      { $set: update },
      { upsert: true }
    );

    const data = await db.collection('inventory').findOne({ date });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BOOKINGS
// ============================================================================

router.get('/bookings', async (req, res) => {
  try {
    const db = await getDb();
    const { status, email, date } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }
    if (email) {
      filter.email = { $regex: email, $options: 'i' };
    }
    if (date) {
      filter.booking_date = date;
    }

    const bookings = await db.collection('bookings').find(filter).sort({ created_at: -1 }).toArray();

    // Manually join service name/category (Mongo has no foreign keys)
    const serviceIds = [...new Set(bookings.map(b => b.service_id))];
    const services = await db.collection('services').find({ id: { $in: serviceIds } }).toArray();
    const serviceMap = {};
    services.forEach(s => { serviceMap[s.id] = s; });

    const result = bookings.map(b => ({
      ...b,
      services: serviceMap[b.service_id]
        ? { name: serviceMap[b.service_id].name, category: serviceMap[b.service_id].category }
        : null
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookings/:id', async (req, res) => {
  try {
    const db = await getDb();
    const booking = await db.collection('bookings').findOne({ id: req.params.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const service = await db.collection('services').findOne({ id: booking.service_id });

    res.json({
      ...booking,
      services: service
        ? { name: service.name, category: service.category, duration: service.duration }
        : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const db = await getDb();
    const bookingId = generateBookingId();
    const {
      devotee_name, phone, email, city, service_id,
      booking_date, slot_time, amount, priest, participants,
      gotra, special_requests
    } = req.body;

    const doc = {
      id: bookingId,
      devotee_name,
      phone,
      email,
      city,
      service_id: parseInt(service_id),
      booking_date,
      slot_time,
      amount: parseFloat(amount),
      priest,
      participants: parseInt(participants) || 1,
      gotra,
      special_requests,
      status: 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db.collection('bookings').insertOne(doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/bookings/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { status, payment_id, order_id } = req.body;
    const update = { updated_at: new Date().toISOString() };

    if (status) update.status = status;
    if (payment_id) update.payment_id = payment_id;
    if (order_id) update.order_id = order_id;

    const result = await db.collection('bookings').findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Booking not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection('bookings').findOneAndUpdate(
      { id: req.params.id },
      { $set: { status: 'Cancelled', updated_at: new Date().toISOString() } },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Booking not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

router.get('/notifications', async (req, res) => {
  try {
    const db = await getDb();
    const { booking_id } = req.query;
    const filter = {};

    if (booking_id) {
      filter.booking_id = booking_id;
    }

    const data = await db.collection('notifications').find(filter).sort({ notification_time: -1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const db = await getDb();
    const { booking_id, title, description } = req.body;
    const doc = {
      booking_id,
      title,
      description,
      is_read: false,
      notification_time: new Date().toISOString()
    };
    await db.collection('notifications').insertOne(doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const db = await getDb();
    const { ObjectId } = require('mongodb');
    const result = await db.collection('notifications').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { is_read: true } },
      { returnDocument: 'after' }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// STATS / KPIs
// ============================================================================

router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const totalBookings = await db.collection('bookings').countDocuments({});

    const todayBookings = await db.collection('bookings').countDocuments({ booking_date: today });

    const revenueData = await db.collection('bookings')
      .find({ status: { $in: ['Confirmed', 'Completed'] } })
      .project({ amount: 1 })
      .toArray();
    const grossRevenue = revenueData.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);

    const upcomingSevas = await db.collection('bookings').countDocuments({
      booking_date: { $gt: today },
      status: { $in: ['Confirmed', 'Pending'] }
    });

    const bookingsToday = await db.collection('bookings')
      .find({ booking_date: today, status: { $ne: 'Cancelled' } })
      .project({ participants: 1 })
      .toArray();

    const totalParticipants = bookingsToday.reduce((sum, b) => sum + (b.participants || 1), 0);
    const utilization = totalParticipants > 0 ? Math.min(95, Math.round((totalParticipants / 100) * 100)) : 0;

    res.json({
      totalBookings: totalBookings || 0,
      todayBookings: todayBookings || 0,
      grossRevenue,
      upcomingSevas: upcomingSevas || 0,
      utilization
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// DAILY BOOKINGS CHART DATA
// ============================================================================

router.get('/chart/daily-bookings', async (req, res) => {
  try {
    const db = await getDb();
    const { month, year } = req.query;
    const m = parseInt(month) || 6;
    const y = parseInt(year) || 2026;

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = new Date(y, m, 0);
    const endDateStr = endDate.toISOString().split('T')[0];

    const data = await db.collection('bookings')
      .find({
        booking_date: { $gte: startDate, $lte: endDateStr },
        status: { $ne: 'Cancelled' }
      })
      .project({ booking_date: 1 })
      .toArray();

    // Group by date
    const counts = {};
    data.forEach(b => {
      counts[b.booking_date] = (counts[b.booking_date] || 0) + 1;
    });

    // Create array for all days in month
    const daysInMonth = new Date(y, m, 0).getDate();
    const result = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.push({
        date: dateStr,
        day: d,
        count: counts[dateStr] || 0
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SERVICE POPULARITY CHART
// ============================================================================

router.get('/chart/service-popularity', async (req, res) => {
  try {
    const db = await getDb();

    const bookings = await db.collection('bookings')
      .find({ status: { $ne: 'Cancelled' } })
      .project({ service_id: 1 })
      .toArray();

    const serviceIds = [...new Set(bookings.map(b => b.service_id))];
    const services = await db.collection('services').find({ id: { $in: serviceIds } }).toArray();
    const serviceMap = {};
    services.forEach(s => { serviceMap[s.id] = s.name; });

    // Group by service
    const counts = {};
    bookings.forEach(b => {
      const name = serviceMap[b.service_id] || 'Unknown';
      counts[name] = (counts[name] || 0) + 1;
    });

    const result = Object.entries(counts).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.generateBookingId = generateBookingId;
module.exports.getNextSequence = getNextSequence;
