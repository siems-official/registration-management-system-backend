import mongoose from 'mongoose';
import {
  PARTICIPANT_TYPES,
  PAYMENT_STATUSES,
  REGISTRATION_SOURCES,
  TSHIRT_SIZES
} from '../config/constants.js';

const RegistrationSchema = new mongoose.Schema(
  {
    participantType: {
      type: String,
      enum: Object.values(PARTICIPANT_TYPES),
      required: true
    },

    name: { type: String, required: true, trim: true },
    nid: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    profession: { type: String, trim: true },
    designation: { type: String, trim: true },
    institution: { type: String, trim: true, required: true },

    presentAddress: { type: String, required: true },
    permanentAddress: { type: String, required: true },
    whatsappNo: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    yearOfPassingBSc: { type: Number },
    yearOfPassingMSc: { type: Number },

    numberOfAccompany: { type: Number, default: 0, min: 0 },
    tshirtSize: { type: String, required: true, enum: TSHIRT_SIZES },
    payableAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    referenceNote: { type: String, default: '', trim: true, maxlength: 1000 },

    // Admin-only visibility. Always set at creation: for participant
    // registrations it is the uploaded file path; admin-created records may
    // carry an empty value until a photo is attached.
    photoUrl: { type: String, default: '', trim: true },

    tran_id: { type: String, required: true },
    // CellFin payment token (returned at token creation / IPN). Persisted at
    // settlement and used for the authoritative status query and future refund.
    gatewayToken: { type: String, default: null },
    // CellFin transaction ID (trId) set once a payment is APPROVED.
    gatewayTrId: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.PENDING
    },
    registrationSource: {
      type: String,
      enum: Object.values(REGISTRATION_SOURCES),
      default: REGISTRATION_SOURCES.SELF
    },

    ticketDisplayId: { type: String, default: null },

    registeredAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Deliberately NO TTL / auto-expiry index — Pending/Failed/Interrupted records
// must persist indefinitely until an admin resolves them (Section 6.3).

RegistrationSchema.index({ tran_id: 1 }, { unique: true });
// Compound duplicate check — NOT unique: duplicate = same email AND same nid.
RegistrationSchema.index({ email: 1, nid: 1 });
RegistrationSchema.index({ paymentStatus: 1, participantType: 1 });
// Admin search
RegistrationSchema.index({ name: 'text', email: 'text', whatsappNo: 'text' });

const Registration = mongoose.model('Registration', RegistrationSchema);

export default Registration;