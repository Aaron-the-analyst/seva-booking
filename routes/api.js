const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Generate unique booking ID
function generateBookingId() {
  const num = Math.floor(Math.random() * 9000000) + 1000000;
  return `SEVA-${num}`;
}

// ============================================================================
// SERVICES
// ============================================================================

router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('id');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
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
    const { data, error } = await supabase
      .from('priests')
      .select('*')
      .order('id');
    if (error) throw error;
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
    const { month, year } = req.query;
    let query = supabase.from('inventory').select('*');

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const endDateStr = endDate.toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDateStr);
    }

    const { data, error } = await query.order('date');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inventory', async (req, res) => {
  try {
    const { date, capacity, day_type, festival_name, waitlist_enabled } = req.body;
    const { data, error } = await supabase
      .from('inventory')
      .upsert({
        date,
        capacity: parseInt(capacity),
        day_type,
        festival_name,
        waitlist_enabled
      }, { onConflict: 'date' })
      .select()
      .single();
    if (error) throw error;
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
    const { status, email, date } = req.query;
    let query = supabase.from('bookings').select('*, services(name, category)');

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (email) {
      query = query.ilike('email', `%${email}%`);
    }
    if (date) {
      query = query.eq('booking_date', date);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookings/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, category, duration)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const bookingId = generateBookingId();
    const {
      devotee_name, phone, email, city, service_id,
      booking_date, slot_time, amount, priest, participants,
      gotra, special_requests
    } = req.body;

    const { data, error } = await supabase
      .from('bookings')
      .insert({
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
        status: 'Pending'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/bookings/:id', async (req, res) => {
  try {
    const { status, payment_id, order_id } = req.body;
    const updateData = { updated_at: new Date().toISOString() };

    if (status) updateData.status = status;
    if (payment_id) updateData.payment_id = payment_id;
    if (order_id) updateData.order_id = order_id;

    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

router.get('/notifications', async (req, res) => {
  try {
    const { booking_id } = req.query;
    let query = supabase.from('notifications').select('*');

    if (booking_id) {
      query = query.eq('booking_id', booking_id);
    }

    const { data, error } = await query.order('notification_time', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const { booking_id, title, description } = req.body;
    const { data, error } = await supabase
      .from('notifications')
      .insert({ booking_id, title, description })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// STATS / KPIs
// ============================================================================

router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Total bookings count
    const { count: totalBookings } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });

    // Today's bookings count
    const { count: todayBookings } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('booking_date', today);

    // Gross revenue (confirmed/completed)
    const { data: revenueData } = await supabase
      .from('bookings')
      .select('amount')
      .in('status', ['Confirmed', 'Completed']);

    const grossRevenue = revenueData?.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0) || 0;

    // Upcoming sevas (future dates)
    const { count: upcomingSevas } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .gt('booking_date', today)
      .in('status', ['Confirmed', 'Pending']);

    // Capacity utilization (approximate)
    const { data: bookingsToday } = await supabase
      .from('bookings')
      .select('participants')
      .eq('booking_date', today)
      .neq('status', 'Cancelled');

    const totalParticipants = bookingsToday?.reduce((sum, b) => sum + (b.participants || 1), 0) || 0;
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
    const { month, year } = req.query;
    const m = parseInt(month) || 6;
    const y = parseInt(year) || 2026;

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = new Date(y, m, 0);
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date')
      .gte('booking_date', startDate)
      .lte('booking_date', endDateStr)
      .neq('status', 'Cancelled');

    if (error) throw error;

    // Group by date
    const counts = {};
    data?.forEach(b => {
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
    const { data, error } = await supabase
      .from('bookings')
      .select('service_id, services(name)')
      .neq('status', 'Cancelled');

    if (error) throw error;

    // Group by service
    const counts = {};
    data?.forEach(b => {
      const name = b.services?.name || 'Unknown';
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
