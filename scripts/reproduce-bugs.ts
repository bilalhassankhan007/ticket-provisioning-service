import { Pool } from "pg";

const API_URL = "http://localhost:3000/purchase";
const EVENT_ID = "EVENT004"; // seeded event exists
const TOTAL = 8;
const QTY = 8;
const CONCURRENCY = 30;

const db = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

async function setupTinyEvent() {
  // reset DB state to make the bug obvious
  await db.query("DELETE FROM issued_tickets WHERE event_id = $1", [EVENT_ID]);
  await db.query(
    "UPDATE ticket_pools SET total = $1, available = $1 WHERE event_id = $2",
    [TOTAL, EVENT_ID],
  );
}

async function buyOnce(i: number) {
  const userId = `load_user_${i}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId: EVENT_ID, quantity: QTY }),
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("Resetting event state...");
  await setupTinyEvent();

  console.log(`Firing ${CONCURRENCY} concurrent purchases of ${QTY}...`);
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) => buyOnce(i + 1)),
  );

  const successes = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.body?.success);

  const allTickets: number[] = successes.flatMap((r) => r.body.tickets ?? []);
  const unique = new Set(allTickets);
  const dupCount = allTickets.length - unique.size;

  const poolRow = await db.query(
    "SELECT total, available FROM ticket_pools WHERE event_id = $1",
    [EVENT_ID],
  );

  const total = Number(poolRow.rows[0].total);
  const available = Number(poolRow.rows[0].available);

  // Oversell indicators: (1) available < 0, or (2) returned tickets exceed total
  const oversold = available < 0 || allTickets.length > total;

  console.log("\n=== RESULTS ===");
  console.log("Successful purchases:", successes.length);
  console.log("Tickets returned:", allTickets.length);
  console.log("Unique ticket numbers:", unique.size);
  console.log("Duplicate ticket numbers:", dupCount);
  console.log("DB total:", total, "DB available:", available);
  console.log("Oversold detected:", oversold);

  if (dupCount > 0) console.log("✅ Duplicate bug reproduced");
  if (oversold) console.log("✅ Oversell bug reproduced");

  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  await db.end();
  process.exit(1);
});
