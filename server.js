const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const maintenanceRoutes = require('./routes/maintenance');
const adminRoutes = require('./routes/admin');
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/admin', adminRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Maintenance-types
const maintenanceTypesRoutes = require('./routes/maintenanceTypes');
app.use('/api/maintenance-types', maintenanceTypesRoutes);

// Close data
const closedDatesRoutes = require('./routes/closedDates');
app.use('/api/closed-dates', closedDatesRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));