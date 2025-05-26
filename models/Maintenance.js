const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  carModel: { type: String, required: true, trim: true },
  licensePlate: { type: String, required: true, trim: true },
  preferredDate: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value) {
        return !isNaN(new Date(value).getTime());
      },
      message: 'preferredDate must be a valid date'
    }
  },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'rejected'] },
  maintenanceType: { type: String, required: true, trim: true },
}, {
  timestamps: true // เพิ่ม createdAt และ updatedAt อัตโนมัติ
});

module.exports = mongoose.model('Maintenance', maintenanceSchema);