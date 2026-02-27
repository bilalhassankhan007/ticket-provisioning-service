import { Pool } from "pg";

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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Atomic reservation + unique ticket range allocation
    const alloc = await client.query(
      `
      UPDATE ticket_pools
      SET
        available = available - $2,
        next_ticket_number = next_ticket_number + $2
      WHERE event_id = $1
        AND available >= $2
      RETURNING
        (next_ticket_number - $2) AS start_ticket,
        (next_ticket_number - 1)  AS end_ticket
      `,
      [eventId, quantity],
    );

    if (alloc.rowCount === 0) {
      const exists = await client.query(
        "SELECT 1 FROM ticket_pools WHERE event_id = $1",
        [eventId],
      );
      throw new Error(
        exists.rowCount === 0
          ? "Event not found"
          : "Not enough tickets available",
      );
    }

    const start = Number(alloc.rows[0].start_ticket);
    const end = Number(alloc.rows[0].end_ticket);

    // ✅ BONUS: One row per purchase (much less write load)
    await client.query(
      `
      INSERT INTO ticket_allocations (event_id, user_id, start_ticket, end_ticket)
      VALUES ($1, $2, $3, $4)
      `,
      [eventId, userId, start, end],
    );

    await client.query("COMMIT");

    // Return allocated ticket numbers (same external behavior)
    const tickets: number[] = [];
    for (let n = start; n <= end; n++) tickets.push(n);
    return tickets;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getPool(): Promise<Pool> {
  return pool;
}
