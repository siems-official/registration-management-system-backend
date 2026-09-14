import mongoose from 'mongoose';

const RegistrationSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'event' },
  registrationDeadline: { type: Date, required: true }
});

const RegistrationSettings = mongoose.model('RegistrationSettings', RegistrationSettingsSchema);

export default RegistrationSettings;