const express = require('express');
const router = express.Router();
const Maintenance = require('../models/Maintenance');
const ClosedDate = require('../models/ClosedDate');
const axios = require('axios');
const auth = require('../middleware/auth');

// กำหนดจำนวนคิวสูงสุดต่อวัน
const MAX_BOOKINGS_PER_DAY = 3; 

// สร้างคำขอ maintenance
router.post('/', async (req, res) => {
  try {
    console.log('Received payload:', req.body); // Log payload
    console.log('Environment variables:', {
      LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID,
      LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'Set' : 'Not set',
    }); // ตรวจสอบ env
    const { name, phone, carModel, licensePlate, preferredDate, maintenanceType } = req.body;

    // ตรวจสอบว่าฟิลด์ครบหรือไม่
    if (!name || !phone || !carModel || !licensePlate || !preferredDate || !maintenanceType) {
      throw new Error('Missing required fields');
    }

    const maintenance = new Maintenance({
      name,
      phone,
      carModel,
      licensePlate,
      preferredDate,
      maintenanceType,
    });
    await maintenance.save();

    // ส่งแจ้งเตือนไปยัง LINE (เพิ่มการจัดการ error)
    const message = `มีคำขอ maintenance ใหม่\nชื่อ: ${maintenance.name}\nเบอร์โทร: ${maintenance.phone}\nรุ่นรถ: ${maintenance.carModel}\nทะเบียน: ${maintenance.licensePlate}\nวันที่สะดวก: ${new Date(maintenance.preferredDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}\nประเภท: ${maintenance.maintenanceType}\nกรุณาโทรไปคอนเฟิร์ม`;
    try {
      await axios.post('https://api.line.me/v2/bot/message/push', {
        to: process.env.LINE_CHANNEL_ID,
        messages: [{ type: 'text', text: message }],
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      });
      console.log('LINE notification sent successfully');
    } catch (lineError) {
      console.error('Failed to send LINE notification:', lineError.response?.data || lineError.message);
      // ไม่ throw error กลับไปที่ client เพื่อให้การบันทึกยังสำเร็จ
    }

    res.status(201).json(maintenance);
  } catch (error) {
    console.error('Error in POST /api/maintenance:', error); // Log full error
    res.status(400).json({ message: error.message });
  }
});

// ดึงคำขอทั้งหมด
router.get('/', auth, async (req, res) => {
  try {
    const requests = await Maintenance.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ดึงวันที่ที่เต็ม (รวมวันที่ถูกจองและวันที่ปิด)
router.get('/booked-dates', async (req, res) => {
  try {
    const fullDates = await Maintenance.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'accepted'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$preferredDate' } },
          count: { $sum: 1 },
        },
      },
      {
        $match: { count: { $gte: MAX_BOOKINGS_PER_DAY } },
      },
      {
        $project: { _id: 1 },
      },
    ]);

    const closedDates = await ClosedDate.find();
    const closedDatesFormatted = closedDates.map(cd => new Date(cd.date).toISOString().split('T')[0]);

    const bookedDates = [
      ...fullDates.map(item => item._id),
      ...closedDatesFormatted,
    ].filter((date, index, self) => self.indexOf(date) === index);

    res.json({ bookedDates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ดึงสรุปสถิติ
router.get('/summary', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayRequests = await Maintenance.countDocuments({
      preferredDate: { $gte: today, $lt: tomorrow },
    });
    const pendingRequests = await Maintenance.countDocuments({ status: 'pending' });
    const statusBreakdown = await Maintenance.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({ todayRequests, pendingRequests, statusBreakdown });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ตรวจสอบสถานะคำขอตามเบอร์โทร
router.post('/check-status', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'กรุณาระบุเบอร์โทร' });
    }
    const requests = await Maintenance.find({ phone }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// อัปเดตสถานะคำขอ
router.patch('/:id', auth, async (req, res) => {
  try {
    const maintenance = await Maintenance.findById(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ message: 'ไม่พบคำขอ' });
    }

    if (req.body.preferredDate) {
      const newDate = new Date(req.body.preferredDate);
      const dateString = newDate.toISOString().split('T')[0];

      const closedDates = await ClosedDate.find();
      const closedDatesFormatted = closedDates.map(cd => new Date(cd.date).toISOString().split('T')[0]);
      if (closedDatesFormatted.includes(dateString)) {
        return res.status(400).json({ message: 'วันที่เลือกถูกปิด กรุณาเลือกวันอื่น' });
      }

      const bookingsOnDate = await Maintenance.countDocuments({
        preferredDate: {
          $gte: new Date(dateString),
          $lt: new Date(new Date(dateString).setDate(new Date(dateString).getDate() + 1)),
        },
        status: { $in: ['pending', 'accepted'] },
        _id: { $ne: req.params.id },
      });

      if (bookingsOnDate >= MAX_BOOKINGS_PER_DAY) {
        return res.status(400).json({ message: 'วันที่เลือกเต็มแล้ว กรุณาเลือกวันอื่น' });
      }

      maintenance.preferredDate = newDate;
    }

    if (req.body.status) {
      maintenance.status = req.body.status;
    }
    if (req.body.maintenanceType) {
      maintenance.maintenanceType = req.body.maintenanceType;
    }

    await maintenance.save();
    res.json(maintenance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ลบคำขอ
router.delete('/:id', auth, async (req, res) => {
  try {
    const maintenance = await Maintenance.findByIdAndDelete(req.params.id);
    if (!maintenance) {
      return res.status(404).json({ message: 'ไม่พบคำขอ' });
    }
    res.json({ message: 'ลบคำขอเรียบร้อย' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Webhook endpoint สำหรับรับ event จาก LINE และส่งไปยัง webhook.site
router.post('/api/webhook/line', async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    for (const event of events) {
      console.log('Received LINE event:', event);

      // ดึง LINE_CHANNEL_ID หรือ groupId จาก event
      let channelId = null;
      if (event.source.type === 'group') {
        channelId = event.source.groupId;
      } else if (event.source.type === 'room') {
        channelId = event.source.roomId;
      } else if (event.source.type === 'user') {
        channelId = event.source.userId; // ใช้ userId ถ้าเป็นการโต้ตอบส่วนตัว
      }

      if (channelId) {
        console.log(`New LINE_CHANNEL_ID detected: ${channelId}`);
        console.log(`Please update LINE_CHANNEL_ID in .env to: ${channelId}`);
        
        // ส่ง event ไปยัง webhook.site (แทนที่ YOUR_WEBHOOK_SITE_URL ด้วย URL จริง)
        const webhookSiteUrl = 'https://webhook.site/xxxx-xxxx-xxxx-xxxx'; // เปลี่ยนเป็น URL จาก webhook.site
        try {
          await axios.post(webhookSiteUrl, {
            event: event,
            detectedChannelId: channelId,
            timestamp: new Date().toISOString(),
          }, {
            headers: { 'Content-Type': 'application/json' },
          });
          console.log(`Event sent to webhook.site successfully`);
        } catch (webhookError) {
          console.error('Failed to send to webhook.site:', webhookError.message);
        }
      } else {
        console.log('No valid LINE_CHANNEL_ID detected in event');
      }

      // ตรวจสอบประเภท event
      if (event.type === 'message') {
        console.log(`Message received from ${channelId || 'unknown'}: ${event.message.text}`);
      }
    }

    res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Error in LINE webhook:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;