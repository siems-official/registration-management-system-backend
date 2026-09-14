import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    });
  }
  return transporter;
}

export async function sendTicketConfirmationEmail({ to, registration }) {
  const html = renderTicketEmail(registration);
  try {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to,
      subject: `Event Registration Confirmed — ${registration.ticketDisplayId}`,
      html
    });
    return true;
  } catch (err) {
    logger.error({ err, to }, 'Ticket email send failed');
    throw err;
  }
}

function renderTicketEmail(r) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:8px">
    <h2 style="color:#1a365d;margin:0 0 8px">Registration Confirmed</h2>
    <p>Dear ${escapeHtml(r.name)},</p>
    <p>Your registration for the alumni event is complete and your payment has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      <tr><td style="padding:6px 0;color:#555">Ticket ID</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(r.ticketDisplayId)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">Participant</td><td style="padding:6px 0">${escapeHtml(r.participantType)}</td></tr>
      <tr><td style="padding:6px 0;color:#555">Amount paid</td><td style="padding:6px 0">BDT ${escapeHtml(String(r.paidAmount))}</td></tr>
    </table>
    <p style="margin-top:24px;font-size:13px;color:#888">Please keep this email and your photo ID for reference. For any questions, contact the event team.</p>
  </div>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resetEmailTransporter() {
  transporter = null;
}