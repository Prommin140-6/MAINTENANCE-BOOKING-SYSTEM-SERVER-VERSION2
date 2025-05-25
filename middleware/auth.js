const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.log('No token found in request');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    console.log('Verifying token with secret:', process.env.JWT_SECRET ? 'defined' : 'undefined');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Token is not valid' });
  }
};