const mongoose = require('mongoose');

    const maintenanceTypeSchema = new mongoose.Schema({
      name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
    });

    module.exports = mongoose.model('MaintenanceType', maintenanceTypeSchema);