import { Pool } from "pg";

interface TicketPool {
  event_id: string;
  total: number;
  available: number;
}

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

export async function purchaseTickets(
  userId: string,
  eventId: string,
  quantity: number,
): Promise<number[]> {
  const availableResult = await pool.query<TicketPool>(
    "SELECT * FROM ticket_pools WHERE event_id = $1",
    [eventId],
  );

  if (availableResult.rows.length === 0) {
    throw new Error("Event not found");
  }

  const ticketPool = availableResult.rows[0];

  if (!ticketPool || ticketPool.available < quantity) {
    throw new Error("Not enough tickets available");
  }

  const currentTotal = ticketPool.total - ticketPool.available;
  const ticketNumbers: number[] = [];

  for (let i = 0; i < quantity; i++) {
    const ticketNumber = currentTotal + i + 1;
    ticketNumbers.push(ticketNumber);

    await pool.query(
      "INSERT INTO issued_tickets (event_id, user_id, ticket_number) VALUES ($1, $2, $3)",
      [eventId, userId, ticketNumber],
    );
  }

  await pool.query(
    "UPDATE ticket_pools SET available = available - $1 WHERE event_id = $2",
    [quantity, eventId],
  );

  return ticketNumbers;
}

export async function getPool(): Promise<Pool> {
  return pool;
}
