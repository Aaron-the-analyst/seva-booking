const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Razorpay only if credentials are available
let rzp = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Step 1: Create order
router.post('/create-order', async (req, res) => {
  const { amount, bookingId } = req.body;

  // If Razorpay not configured, return mock order for testing
  if (!rzp) {
    const mockOrderId = 'order_mock_' + Date.now();
    return res.json({ orderId: mockOrderId, amount: Math.round(amount * 100) });
  }

  try {
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: bookingId,
      notes: { booking_id: bookingId }
    });

    // Update booking with order ID
    await supabase
      .from('bookings')
      .update({ order_id: order.id })
      .eq('id', bookingId);

    res.json({ orderId: order.id, amount: order.amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Verify payment signature
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

  // If Razorpay not configured, accept mock payments
  if (!rzp || razorpay_order_id?.startsWith('order_mock_')) {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'Confirmed',
        payment_id: razorpay_payment_id || 'mock_payment_' + Date.now(),
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, paymentId: razorpay_payment_id || 'mock', booking: data });
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expected === razorpay_signature) {
    // Update booking status to 'Confirmed' in DB
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'Confirmed',
        payment_id: razorpay_payment_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    // Create notification
    await supabase
      .from('notifications')
      .insert({
        booking_id: booking_id,
        title: 'Payment Confirmed',
        description: `Payment of ${data.amount} confirmed for booking ${booking_id}. Your seva is now confirmed.`
      });

    res.json({ success: true, paymentId: razorpay_payment_id, booking: data });
  } else {
    res.status(400).json({ success: false, error: 'Signature mismatch' });
  }
});

// Step 3: Webhook (Razorpay → your server, for refunds/failures)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // If Razorpay not configured, accept webhook mock for testing
  if (!rzp) {
    return res.json({ received: true, note: 'Razorpay not configured - mock mode' });
  }

  const signature = req.headers['x-razorpay-signature'];
  const body = req.body.toString();
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (expected === signature) {
    const event = JSON.parse(body);

    if (event.event === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        // Find booking by order_id and mark as failed
        await supabase
          .from('bookings')
          .update({ status: 'Failed', updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
      }
    }

    if (event.event === 'payment.captured') {
      const orderId = event.payload?.payment?.entity?.order_id;
      const paymentId = event.payload?.payment?.entity?.id;
      if (orderId) {
        await supabase
          .from('bookings')
          .update({
            status: 'Confirmed',
            payment_id: paymentId,
            updated_at: new Date().toISOString()
          })
          .eq('order_id', orderId);
      }
    }

    res.json({ received: true });
  } else {
    res.status(400).end();
  }
});

// Update booking status (admin action)
router.patch('/booking/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
