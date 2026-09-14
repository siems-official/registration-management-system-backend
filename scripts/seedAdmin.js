import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import Admin from '../src/models/Admin.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';

/**
 * Provision an admin account.
 * Usage: npm run seed:admin -- <username> <password> [role]
 * Or set ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_ROLE in .env.
 * Prints a TOTP otpauth:// URI that must be added to the admin's authenticator
 * app. The secret is ONLY printed here — store it with the admin securely and
 * never commit it.
 */
async function main() {
  const username = process.argv[2] || process.env.ADMIN_USERNAME;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const role = process.argv[4] || process.env.ADMIN_ROLE || 'SuperAdmin';

  if (!username || !password) {
    console.error('Usage: npm run seed:admin -- <username> <password> [SuperAdmin|Admin]');
    console.error('   or set ADMIN_USERNAME / ADMIN_PASSWORD in .env');
    process.exit(1);
  }
  if (!['SuperAdmin', 'Admin'].includes(role)) {
    console.error('role must be SuperAdmin or Admin');
    process.exit(1);
  }

  await connectDB();

  const exists = await Admin.findOne({ username });
  if (exists) {
    console.error(`Admin '${username}' already exists. Use a different username and rerun.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const totpSecret = authenticator.generateSecret();
  const admin = await Admin.create({ username, passwordHash, totpSecret, role });

  const otpauth = authenticator.keyuri(username, env.admin2faIssuer, totpSecret);

  console.log('Admin created:');
  console.log({ id: admin._id.toString(), username: admin.username, role: admin.role });
  console.log('');
  console.log('TOTP secret (store securely, show ONLY to this admin):');
  console.log(totpSecret);
  console.log('');
  console.log('Add to authenticator app via QR/manual entry:');
  console.log(otpauth);

  await disconnectDB();
}

main().catch((err) => {
  console.error('seed:admin failed:', err);
  process.exit(1);
});