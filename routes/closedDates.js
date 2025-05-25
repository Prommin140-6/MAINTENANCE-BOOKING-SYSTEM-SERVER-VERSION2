const express = require('express');
    const router = express.Router();
    const ClosedDate = require('../models/ClosedDate');
    const axios = require('axios');

    // GET: ดึงวันที่ที่ถูกปิด
    router.get('/', async (req, res) => {
      try {
        const closedDates = await ClosedDate.find();
        res.json(closedDates);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // POST: ปิดวัน
    router.post('/', async (req, res) => {
      const { date } = req.body;
      try {
        const closedDate = new ClosedDate({ date });
        await closedDate.save();

        // ส่งแจ้งเตือนไปยัง LINE
        const message = `วันที่ ${new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ถูกปิดรับคิวแล้ว`;
        await axios.post('https://api.line.me/v2/bot/message/push', {
          to: process.env.LINE_CHANNEL_ID,
          messages: [{ type: 'text', text: message }],
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
        });

        res.status(201).json(closedDate);
      } catch (err) {
        res.status(400).json({ message: err.message });
      }
    });

    // DELETE: เปิดวัน
    router.delete('/:id', async (req, res) => {
      try {
        const closedDate = await ClosedDate.findById(req.params.id);
        if (!closedDate) return res.status(404).json({ message: 'Closed date not found' });

        await ClosedDate.findByIdAndDelete(req.params.id);

        // ส่งแจ้งเตือนไปยัง LINE
        const message = `วันที่ ${new Date(closedDate.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ถูกเปิดรับคิวแล้ว`;
        await axios.post('https://api.line.me/v2/bot/message/push', {
          to: process.env.LINE_CHANNEL_ID,
          messages: [{ type: 'text', text: message }],
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
        });

        res.json({ message: 'Opened successfully' });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    module.exports = router;