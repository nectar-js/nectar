/**
 * An in-memory ticket store, enough to show the component flow. It empties on every reload of
 * this file in `nectar dev` and on restart; a real bot keeps tickets in a database.
 */

export interface Ticket {
  id: string;
  subject: string;
  openedBy: string;
  assignee: string | null;
}

export class TicketNotFound extends Error {
  constructor(id: string) {
    super(`No ticket ${id}.`);
    this.name = "TicketNotFound";
  }
}

const tickets = new Map<string, Ticket>();
let nextId = 1;

export function openTicket(subject: string, openedBy: string): Ticket {
  const ticket = { id: String(nextId++), subject, openedBy, assignee: null };
  tickets.set(ticket.id, ticket);
  return ticket;
}

export function assignTicket(id: string, assignee: string): Ticket {
  const ticket = getTicket(id);
  ticket.assignee = assignee;
  return ticket;
}

export function closeTicket(id: string, reason: string): Ticket {
  const ticket = getTicket(id);
  tickets.delete(id);
  return { ...ticket, subject: `${ticket.subject} (${reason})` };
}

function getTicket(id: string): Ticket {
  const ticket = tickets.get(id);
  if (ticket === undefined) throw new TicketNotFound(id);
  return ticket;
}
