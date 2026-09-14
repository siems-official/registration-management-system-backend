import FeeConfig from '../src/models/FeeConfig.js';
import Capacity from '../src/models/Capacity.js';
import RegistrationSettings from '../src/models/RegistrationSettings.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

/**
 * Ensure the three singleton settings documents exist. Idempotent — will only
 * create missing ones, never overwrite existing values.
 */
async function main() {
  await connectDB();
  await FeeConfig.findByIdAndUpdate(
    'event',
    { $setOnInsert: { alumnusFee: 2000, currentStudentFee: 1000, perAccompanyFee: 1000 } },
    { upsert: true }
  );
  await Capacity.findByIdAndUpdate(
    'event',
    { $setOnInsert: { maxCapacity: 5000, paidSlots: 0 } },
    { upsert: true }
  );
  await RegistrationSettings.findByIdAndUpdate(
    'event',
    { $setOnInsert: { registrationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
    { upsert: true }
  );

  const [fees, capacity, settings] = await Promise.all([
    FeeConfig.findById('event'),
    Capacity.findById('event'),
    RegistrationSettings.findById('event')
  ]);
  console.log('Settings ensured:');
  console.log({ fees, capacity, registrationDeadline: settings.registrationDeadline });
  await disconnectDB();
}

main().catch((err) => {
  console.error('seed:settings failed:', err);
  process.exit(1);
});