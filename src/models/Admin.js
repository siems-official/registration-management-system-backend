import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { ADMIN_ROLES } from '../config/constants.js';

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  totpSecret: { type: String, required: true },
  role: { type: String, enum: Object.values(ADMIN_ROLES), default: ADMIN_ROLES.ADMIN },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
});

AdminSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

const Admin = mongoose.model('Admin', AdminSchema);

export default Admin;