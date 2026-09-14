import Capacity from '../models/Capacity.js';

const EVENT_ID = 'event';

export async function getCapacity() {
  return Capacity.findById(EVENT_ID);
}

export async function isCapacityAvailable() {
  const cap = await Capacity.findById(EVENT_ID);
  if (!cap) return true;
  return cap.paidSlots < cap.maxCapacity;
}

export async function ensureCapacityExists() {
  await Capacity.findByIdAndUpdate(
    EVENT_ID,
    { $setOnInsert: { maxCapacity: 5000, paidSlots: 0 } },
    { upsert: true }
  );
}

/**
 * Atomic slot reservation (Section 6.2). Single findOneAndUpdate closes the
 * concurrent-settlement race: two IPNs can never both read a passing count.
 *
 * @returns {{ reserved: true, capacity: object } | { reserved: false }}
 */
export async function reserveSlot() {
  const capacity = await Capacity.findOneAndUpdate(
    { _id: EVENT_ID, $expr: { $lt: ['$paidSlots', '$maxCapacity'] } },
    { $inc: { paidSlots: 1 } },
    { new: true }
  );
  if (!capacity) return { reserved: false };
  return { reserved: true, capacity };
}

/**
 * Admin-only capacity override used to resolve an Oversold-PendingReview
 * record (mark-paid) or apply a refund (release). Deliberately bypasses the
 * atomic `paidSlots < maxCapacity` guard on the increment path. MUST be
 * audited as `capacity_manual_override` with before/after paidSlots.
 */
export async function manualCapacityChange(delta, { floorAtZero = false } = {}) {
  const before = await Capacity.findById(EVENT_ID);
  const beforeSnap = before ? { paidSlots: before.paidSlots, maxCapacity: before.maxCapacity } : null;

  const update = { $inc: { paidSlots: delta } };
  if (floorAtZero) update.$max = { paidSlots: 0 };

  const after = await Capacity.findByIdAndUpdate(EVENT_ID, update, { new: true });
  return {
    before: beforeSnap,
    after: after ? { paidSlots: after.paidSlots, maxCapacity: after.maxCapacity } : null
  };
}

export async function setMaxCapacity(maxCapacity) {
  const before = await Capacity.findById(EVENT_ID);
  await ensureCapacityExists();
  const setupBefore = await Capacity.findById(EVENT_ID);
  const beforeSnap = setupBefore || before;
  const after = await Capacity.findByIdAndUpdate(
    EVENT_ID,
    { maxCapacity },
    { new: true, upsert: true }
  );
  return { before: beforeSnap, after };
}