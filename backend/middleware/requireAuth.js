const jwt = require('jsonwebtoken');
const { findUserById } = require('../db/users');

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;
    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    const user = await findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }
    if (user.isBanned) {
      return res.status(403).json({ message: 'Account is banned.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireAuth;
