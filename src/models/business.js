import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  logoUrl: String,
  headerImageUrl: String,
  phone: String,
  address: String,
  services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
}, { timestamps: true });

export default mongoose.model('Business', businessSchema);
