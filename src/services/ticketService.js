import { generateTicketDisplayId } from '../utils/crypto.js';

export function issueTicket(participantType) {
  return generateTicketDisplayId(participantType);
}