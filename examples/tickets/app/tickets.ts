import { database } from "./db.ts";

export interface Ticket {
  id: number;
  subject: string;
  openedBy: string;
  assignee: string | null;
  reason: string | null;
  openedAt: number;
  closedAt: number | null;
}

export class TicketNotFound extends Error {
  constructor(id: string | number) {
    super(`No open ticket ${id}.`);
    this.name = "TicketNotFound";
  }
}

interface Row {
  id: number;
  subject: string;
  opened_by: string;
  assignee: string | null;
  reason: string | null;
  opened_at: number;
  closed_at: number | null;
}

export function openTicket(subject: string, openedBy: string): Ticket {
  const { lastInsertRowid } = database()
    .prepare("INSERT INTO tickets (subject, opened_by, opened_at) VALUES (?, ?, ?)")
    .run(subject, openedBy, Date.now());
  return getTicket(Number(lastInsertRowid));
}

/** Open tickets, oldest first. */
export function openTickets(): Ticket[] {
  const rows = database()
    .prepare("SELECT * FROM tickets WHERE closed_at IS NULL ORDER BY id")
    .all() as unknown as Row[];
  return rows.map(fromRow);
}

export function assignTicket(id: string, assignee: string): Ticket {
  const ticket = getTicket(Number(id));
  database().prepare("UPDATE tickets SET assignee = ? WHERE id = ?").run(assignee, ticket.id);
  return { ...ticket, assignee };
}

export function closeTicket(id: string, reason: string): Ticket {
  const ticket = getTicket(Number(id));
  const closedAt = Date.now();
  database()
    .prepare("UPDATE tickets SET reason = ?, closed_at = ? WHERE id = ?")
    .run(reason, closedAt, ticket.id);
  return { ...ticket, reason, closedAt };
}

/** Deletes tickets closed before `before`, epoch milliseconds. Returns how many went. */
export function pruneClosedTickets(before: number): number {
  const { changes } = database()
    .prepare("DELETE FROM tickets WHERE closed_at IS NOT NULL AND closed_at < ?")
    .run(before);
  return Number(changes);
}

/** An open ticket by ID. Closed and unknown tickets both throw `TicketNotFound`. */
function getTicket(id: number): Ticket {
  const row = database()
    .prepare("SELECT * FROM tickets WHERE id = ? AND closed_at IS NULL")
    .get(id) as unknown as Row | undefined;
  if (row === undefined) throw new TicketNotFound(id);
  return fromRow(row);
}

function fromRow(row: Row): Ticket {
  return {
    id: row.id,
    subject: row.subject,
    openedBy: row.opened_by,
    assignee: row.assignee,
    reason: row.reason,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}
