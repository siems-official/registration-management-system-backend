import mongoose from 'mongoose';

const CapacitySchema = new mongoose.Schema({
  _id: { type: String, default: 'event' },
  maxCapacity: { type: Number, required: true, default: 5000 },
  paidSlots: { type: Number, default: 0 }
});

const Capacity = mongoose.model('Capacity', CapacitySchema);

export default Capacity;