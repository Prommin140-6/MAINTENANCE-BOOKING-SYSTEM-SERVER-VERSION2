const express = require('express');
    const router = express.Router();
    const MaintenanceType = require('../models/MaintenanceType');

    // GET: ดึงรายการประเภททั้งหมด
    router.get('/', async (req, res) => {
      try {
        const types = await MaintenanceType.find();
        res.json(types);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // POST: เพิ่มประเภทใหม่
    router.post('/', async (req, res) => {
      const { name } = req.body;
      try {
        const type = new MaintenanceType({ name });
        await type.save();
        res.status(201).json(type);
      } catch (err) {
        res.status(400).json({ message: err.message });
      }
    });

    // DELETE: ลบประเภท
    router.delete('/:id', async (req, res) => {
      try {
        await MaintenanceType.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted successfully' });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    module.exports = router;