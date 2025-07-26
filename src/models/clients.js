import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true },
  phone: String
}, { timestamps: true });

export default mongoose.model('Client', clientSchema);
