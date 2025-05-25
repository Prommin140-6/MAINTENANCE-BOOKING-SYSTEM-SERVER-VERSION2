const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../models/Booking');
const authMiddleware = require('../middleware/auth');

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Create a new booking
router.post('/', async (req, res) => {
  const { name, phone, carModel, licensePlate, date, time } = req.body;

  try {
    if (!name || !phone || !carModel || !licensePlate || !date || !time) {
      return res.status(400).json({ message: 'กรุณาระบุข้อมูลทั้งหมด' });
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'เบอร์โทรต้องมี 10 หลัก เริ่มต้นด้วย 0' });
    }

    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);
    const existingBooking = await Booking.findOne({
      date: bookingDate,
      time,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'เวลาเต็ม' });
    }

    const booking = new Booking({
      name,
      phone,
      carModel,
      licensePlate,
      date: bookingDate,
      time,
      status: 'pending',
    });
    await booking.save();

    // แจ้งเตือนแอดมินเท่านั้น
    if (ADMIN_USER_ID && CHANNEL_ACCESS_TOKEN) {
      try {
        const adminResponse = await axios.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to: ADMIN_USER_ID,
            messages: [
              {
                type: 'text',
                text: `มีลูกค้าจองคิวใหม่: ${name} [${date}] [${time}] กรุณาตรวจสอบ\nเบอร์โทร: ${phone}\nรุ่นรถ: ${carModel}\nหมายเลขทะเบียน: ${licensePlate}`,
              },
            ],
          },
          { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
        );
        console.log('LINE notification to admin sent successfully:', adminResponse.data);
      } catch (lineError) {
        console.error('Failed to send LINE notification to admin:', {
          status: lineError.response?.status,
          data: lineError.response?.data,
          message: lineError.message,
        });
      }
    } else {
      console.warn('Cannot send LINE notification to admin: ADMIN_USER_ID or CHANNEL_ACCESS_TOKEN is missing');
    }

    res.status(201).json({ message: 'จองสำเร็จ', booking });
  } catch (error) {
    console.error('Error creating booking:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all bookings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booking summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const summary = {
      todayBookings: await Booking.countDocuments({
        date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
      }),
      pendingBookings: await Booking.countDocuments({ status: 'pending' }),
      statusBreakdown: await Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    };
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking status, date, and time
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { status, date, time } = req.body;

    // ตรวจสอบข้อมูลที่ส่งมา
    if (!status && !date && !time) {
      return res.status(400).json({ message: 'ต้องระบุอย่างน้อยหนึ่งฟิลด์: status, date, หรือ time' });
    }

    // สร้าง object สำหรับอัปเดต
    const updateFields = {};
    if (status) {
      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      updateFields.status = status;
    }
    if (date) {
      const bookingDate = new Date(date);
      if (isNaN(bookingDate.getTime())) {
        return res.status(400).json({ message: 'วันที่ไม่ถูกต้อง' });
      }
      bookingDate.setHours(0, 0, 0, 0);
      updateFields.date = bookingDate;
    }
    if (time) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(time)) {
        return res.status(400).json({ message: 'รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:mm' });
      }
      updateFields.time = time;
    }

    // ตรวจสอบว่าเวลาใหม่ถูกจองหรือยัง (ถ้ามีการอัปเดต date หรือ time)
    if (date || time) {
      const bookingDate = updateFields.date || (await Booking.findById(req.params.id))?.date;
      const bookingTime = updateFields.time || (await Booking.findById(req.params.id))?.time;
      if (bookingDate && bookingTime) {
        const existingBooking = await Booking.findOne({
          date: bookingDate,
          time: bookingTime,
          status: { $in: ['pending', 'accepted'] },
          _id: { $ne: req.params.id }, // ยกเว้นการจองปัจจุบัน
        });
        if (existingBooking) {
          return res.status(400).json({ message: 'เวลาเต็ม' });
        }
      }
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // เพิ่มการแจ้งเตือนแอดมินเมื่อมีการเลื่อนเวลา
    if ((date || time) && ADMIN_USER_ID && CHANNEL_ACCESS_TOKEN) {
      try {
        const adminResponse = await axios.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to: ADMIN_USER_ID,
            messages: [
              {
                type: 'text',
                text: `การจองของ ${booking.name} ถูกเลื่อนเวลา\nวันที่ใหม่: ${booking.date.toISOString().split('T')[0]}\nเวลาใหม่: ${booking.time}\nเบอร์โทร: ${booking.phone}\nรุ่นรถ: ${booking.carModel}\nหมายเลขทะเบียน: ${booking.licensePlate}`,
              },
            ],
          },
          { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
        );
        console.log('LINE notification to admin sent successfully:', adminResponse.data);
      } catch (lineError) {
        console.error('Failed to send LINE notification to admin:', {
          status: lineError.response?.status,
          data: lineError.response?.data,
          message: lineError.message,
        });
      }
    }

    res.json({ message: 'Booking updated', booking });
  } catch (error) {
    console.error('PATCH /api/bookings/:id error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a booking
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booked times for a specific date
router.get('/booked-times', async (req, res) => {
  try {
    const dateParam = req.query.date;
    if (!dateParam) {
      return res.status(400).json({ message: 'Missing date parameter' });
    }

    const date = new Date(dateParam);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const bookings = await Booking.find({
      date: { $gte: date, $lt: nextDate },
      status: { $in: ['pending', 'accepted'] },
    });

    const bookedTimes = bookings.map((b) => b.time);

    res.json({ bookedTimes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;