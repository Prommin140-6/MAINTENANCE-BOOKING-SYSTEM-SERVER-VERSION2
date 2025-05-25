const express = require('express');
const router = express.Router();
const Maintenance = require('../models/Maintenance');
const ClosedDate = require('../models/ClosedDate');
const axios = require('axios');
const auth = require('../middleware/auth');

// กำหนดจำนวนคิวสูงสุดต่อวัน
const MAX_BOOKINGS_PER_DAY = 4; // ปรับเปลี่ยนตามต้องการ

// สร้างคำขอ maintenance
router.post('/', async (req, res) => {
  try {
    const { name, phone, carModel, licensePlate, preferredDate, maintenanceType } = req.body;
    const maintenance = new Maintenance({
      name,
      phone,
      carModel,
      licensePlate,
      preferredDate,
      maintenanceType,
    });
    await maintenance.save();

    // ส่งแจ้งเตือนไปยัง LINE
    const message = `มีคำขอ maintenance ใหม่\nชื่อ: ${maintenance.name}\nเบอร์โทร: ${maintenance.phone}\nรุ่นรถ: ${maintenance.carModel}\nทะเบียน: ${maintenance.licensePlate}\nวันที่สะดวก: ${new Date(maintenance.preferredDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}\nประเภท: ${maintenance.maintenanceType}\nกรุณาโทรไปคอนเฟิร์ม`;
    await axios.post('https://api.line.me/v2/bot/message/push', {
      to: process.env.LINE_CHANNEL_ID,
      messages: [{ type: 'text', text: message }],
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });

    res.status(201).json(maintenance);
  } catch (error) {
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

      // ตรวจสอบวันที่ถูกปิด
      const closedDates = await ClosedDate.find();
      const closedDatesFormatted = closedDates.map(cd => new Date(cd.date).toISOString().split('T')[0]);
      if (closedDatesFormatted.includes(dateString)) {
        return res.status(400).json({ message: 'วันที่เลือกถูกปิด กรุณาเลือกวันอื่น' });
      }

      // ตรวจสอบจำนวนคิวในวันที่ต้องการย้ายไป
      const bookingsOnDate = await Maintenance.countDocuments({
        preferredDate: {
          $gte: new Date(dateString),
          $lt: new Date(new Date(dateString).setDate(new Date(dateString).getDate() + 1)),
        },
        status: { $in: ['pending', 'accepted'] },
        _id: { $ne: req.params.id }, // ไม่นับคำขอปัจจุบัน
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

    maintenance.updatedAt = Date.now();
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

module.exports = router;