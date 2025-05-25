const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  carModel: { type: String, required: true },
  licensePlate: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  userId: { type: String } 
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', bookingSchema);