const express = require('express');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

router.post('/email', async (req, res) => {
  const { to, name, bookingId, sevaName, date, time, amount } = req.body;
  try {
    await transporter.sendMail({
      from: `"Sri Sidhivinayak Mandir" <${process.env.SMTP_USER}>`,
      to,
      subject: `Booking Confirmed: ${sevaName} — ${bookingId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #E8E0D2;border-radius:12px;overflow:hidden;">
          <div style="background:#E35205;padding:24px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:22px;">Seva Booking Confirmed</h1>
          </div>
          <div style="padding:24px;">
            <p>Namaste <strong>${name}</strong>,</p>
            <p>Your reservation has been confirmed. Details below:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;background:#FAF5EC;font-weight:bold;">Booking ID</td><td style="padding:8px;">${bookingId}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Seva</td><td style="padding:8px;">${sevaName}</td></tr>
              <tr><td style="padding:8px;background:#FAF5EC;font-weight:bold;">Date & Time</td><td style="padding:8px;">${date} at ${time}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Amount Paid</td><td style="padding:8px;">₹${amount}</td></tr>
            </table>
            <p style="color:#706359;font-size:13px;">Please show this email or your QR ticket at the temple gate. Traditional attire recommended.</p>
          </div>
          <div style="background:#FAF5EC;padding:16px;text-align:center;font-size:12px;color:#706359;">
            Sri Sidhivinayak Mandir Trust · Jai Ganesh
          </div>
        </div>
      `
    });

    // Store notification in database
    await supabase.from('notifications').insert({
      booking_id: bookingId,
      title: 'Email Confirmation Sent',
      description: `Confirmation email sent to ${to} for booking ${bookingId}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp notification (using Twilio)
router.post('/whatsapp', async (req, res) => {
  const { phone, name, bookingId, sevaName, date, time } = req.body;

  // Skip if Twilio not configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return res.json({ success: true, message: 'WhatsApp skipped - not configured' });
  }

  try {
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const message = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phone}`,
      body: `🙏 Namaste ${name}! Your Seva booking is confirmed.\n\nBooking ID: ${bookingId}\nSeva: ${sevaName}\nDate: ${date}\nTime: ${time}\n\nPlease show this message at the temple gate. Sri Sidhivinayak Mandir.`
    });

    await supabase.from('notifications').insert({
      booking_id: bookingId,
      title: 'WhatsApp Confirmation Sent',
      description: `WhatsApp confirmation sent to ${phone} for booking ${bookingId}`
    });

    res.json({ success: true, sid: message.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
