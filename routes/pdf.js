const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

router.get('/ticket', (req, res) => {
  const { bookingId, sevaName, date, time, devoteeName, participants, priest, gotra } = req.query;

  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Ticket_${bookingId}.pdf"`);
  doc.pipe(res);

  // Saffron header bar
  doc.rect(0, 0, doc.page.width, 80).fill('#E35205');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
     .text('Sri Sidhivinayak Mandir', 40, 20, { align: 'center' });
  doc.fontSize(11).font('Helvetica')
     .text('SEVA ACCESS TICKET', 40, 48, { align: 'center' });

  // Gold divider
  doc.moveDown(3);
  doc.rect(40, 90, doc.page.width - 80, 3).fill('#D4AF37');

  // QR code placeholder
  doc.rect(doc.page.width / 2 - 55, 105, 110, 110)
     .lineWidth(1).strokeColor('#E8E0D2').stroke();
  doc.fillColor('#706359').fontSize(9)
     .text(bookingId || 'SCAN QR AT GATE', doc.page.width / 2 - 40, 148);

  // Booking details
  doc.moveDown(7);
  const details = [
    ['Booking ID', bookingId || 'N/A'],
    ['Seva Name', sevaName || 'N/A'],
    ['Date & Time', `${date || 'N/A'} at ${time || 'N/A'}`],
    ['Devotee', devoteeName || 'N/A'],
    ['Priest', priest || 'N/A'],
    ['Participants', String(participants || 1)],
    ['Gotra', gotra || 'N/A'],
  ];

  details.forEach(([label, value], i) => {
    const y = 240 + i * 30;
    const bg = i % 2 === 0 ? '#FAF5EC' : '#FFFFFF';
    doc.rect(40, y, doc.page.width - 80, 28).fill(bg);
    doc.fillColor('#706359').font('Helvetica').fontSize(10).text(label, 52, y + 8);
    doc.fillColor('#2C2520').font('Helvetica-Bold').fontSize(10).text(value, 200, y + 8);
  });

  // Footer
  doc.rect(0, doc.page.height - 50, doc.page.width, 50).fill('#FAF5EC');
  doc.fillColor('#E35205').font('Helvetica-Bold').fontSize(10)
     .text('Traditional attire required · Report 20 mins early · Jai Ganesh',
           40, doc.page.height - 35, { align: 'center' });

  doc.end();
});

module.exports = router;
