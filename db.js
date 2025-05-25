const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    // ลบคำว่า MONGO_URI= ออกจาก log เพื่อให้ชัดเจน
    console.log('Attempting to connect to MongoDB with URI:', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;