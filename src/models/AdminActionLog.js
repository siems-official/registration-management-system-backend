import mongoose from 'mongoose';

const AdminActionLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  action: { type: String, required: true },
  targetType: { type: String },
  targetId: { type: mongoose.Schema.Types.Mixed },
  before: { type: Object },
  after: { type: Object },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now }
});

AdminActionLogSchema.index({ adminId: 1, timestamp: -1 });
AdminActionLogSchema.index({ action: 1, timestamp: -1 });
AdminActionLogSchema.index({ timestamp: -1 });

const AdminActionLog = mongoose.model('AdminActionLog', AdminActionLogSchema);

export default AdminActionLog;