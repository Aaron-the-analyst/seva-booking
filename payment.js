const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('./db');

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
    return res.json({ orderId: mockOrderId, amount: Math.round(amount * 100), keyId: null });
  }

  try {
    const order = await rzp.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: bookingId,
      notes: { booking_id: bookingId }
    });

    // Update booking with order ID
    const db = await getDb();
    await db.collection('bookings').updateOne(
      { id: bookingId },
      { $set: { order_id: order.id } }
    );

    res.json({ orderId: order.id, amount: order.amount, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Verify payment signature
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;
  const db = await getDb();

  // If Razorpay not configured, accept mock payments
  if (!rzp || razorpay_order_id?.startsWith('order_mock_')) {
    const result = await db.collection('bookings').findOneAndUpdate(
      { id: booking_id },
      {
        $set: {
          status: 'Confirmed',
          payment_id: razorpay_payment_id || 'mock_payment_' + Date.now(),
          updated_at: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(500).json({ success: false, error: 'Booking not found' });
    }

    return res.json({ success: true, paymentId: razorpay_payment_id || 'mock', booking: result });
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expected === razorpay_signature) {
    // Update booking status to 'Confirmed' in DB
    const result = await db.collection('bookings').findOneAndUpdate(
      { id: booking_id },
      {
        $set: {
          status: 'Confirmed',
          payment_id: razorpay_payment_id,
          updated_at: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(500).json({ success: false, error: 'Booking not found' });
    }

    // Create notification
    await db.collection('notifications').insertOne({
      booking_id: booking_id,
      title: 'Payment Confirmed',
      description: `Payment of ${result.amount} confirmed for booking ${booking_id}. Your seva is now confirmed.`,
      is_read: false,
      notification_time: new Date().toISOString()
    });

    res.json({ success: true, paymentId: razorpay_payment_id, booking: result });
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
    const db = await getDb();

    if (event.event === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        await db.collection('bookings').updateOne(
          { order_id: orderId },
          { $set: { status: 'Failed', updated_at: new Date().toISOString() } }
        );
      }
    }

    if (event.event === 'payment.captured') {
      const orderId = event.payload?.payment?.entity?.order_id;
      const paymentId = event.payload?.payment?.entity?.id;
      if (orderId) {
        await db.collection('bookings').updateOne(
          { order_id: orderId },
          {
            $set: {
              status: 'Confirmed',
              payment_id: paymentId,
              updated_at: new Date().toISOString()
            }
          }
        );
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
    const db = await getDb();
    const result = await db.collection('bookings').findOneAndUpdate(
      { id: req.params.id },
      { $set: { status, updated_at: new Date().toISOString() } },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Booking not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
