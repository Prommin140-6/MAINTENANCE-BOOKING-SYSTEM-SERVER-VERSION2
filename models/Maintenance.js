const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  carModel: { type: String, required: true },
  licensePlate: { type: String, required: true },
  preferredDate: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Maintenance', maintenanceSchema);