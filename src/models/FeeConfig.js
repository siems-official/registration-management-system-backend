import mongoose from 'mongoose';

const FeeConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'event' },
  alumnusFee: { type: Number, required: true, default: 2000 },
  currentStudentFee: { type: Number, required: true, default: 1000 },
  perAccompanyFee: { type: Number, required: true, default: 1000 },
  updatedAt: { type: Date, default: Date.now }
});

const FeeConfig = mongoose.model('FeeConfig', FeeConfigSchema);

export default FeeConfig;