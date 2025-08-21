// src/middleware/validateObjectId.js
import mongoose from 'mongoose';

/**
 * Middleware to validate MongoDB ObjectId in route parameters.
 * @param {string} paramName - The name of the route parameter to validate.
 */
export const validateObjectId = (paramName) => (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
    return res.status(400).json({ message: `Invalid ID for ${paramName}` });
  }
  next();
};
