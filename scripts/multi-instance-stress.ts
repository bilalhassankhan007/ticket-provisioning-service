import { Pool } from "pg";

const EVENT_ID = "EVENT004";
const TOTAL = 80; // 10 successful purchases of 8
const QTY = 8;
const CONCURRENCY = 50;

const URLS: string[] = [
  "http://localhost:3000/purchase",
  "http://localhost:3001/purchase",
];

const db = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

async function resetEvent() {
  // IMPORTANT: clear allocations too (bonus mode)
  await db.query("DELETE FROM issued_tickets WHERE event_id = $1", [EVENT_ID]);
  await db.query("DELETE FROM ticket_allocations WHERE event_id = $1", [
    EVENT_ID,
  ]);

  await db.query(
    "UPDATE ticket_pools SET total=$1, available=$1, next_ticket_number=1 WHERE event_id=$2",
    [TOTAL, EVENT_ID],
  );
}

async function buyOnce(i: number) {
  const url = URLS[i % URLS.length]!;
  const userId = `mi_user_${i}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId: EVENT_ID, quantity: QTY }),
  });

  const body = await res.json().catch(() => ({}));
  return { url, status: res.status, body };
}

async function main() {
  console.log("Resetting event state for multi-instance test...");
  await resetEvent();

  console.log(
    `Firing ${CONCURRENCY} concurrent purchases across 2 instances...`,
  );
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, idx) => buyOnce(idx + 1)),
  );

  const successes = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.body?.success);

  const allTickets: number[] = successes.flatMap((r) => r.body.tickets ?? []);
  const unique = new Set(allTickets);

  const poolRow = await db.query(
    "SELECT total, available FROM ticket_pools WHERE event_id=$1",
    [EVENT_ID],
  );

  const total = Number(poolRow.rows[0].total);
  const available = Number(poolRow.rows[0].available);

  const duplicates = allTickets.length - unique.size;
  const oversold = available < 0 || allTickets.length > total;

  console.log("\n=== MULTI-INSTANCE RESULTS ===");
  console.log("Successful purchases:", successes.length);
  console.log("Tickets returned:", allTickets.length);
  console.log("Unique ticket numbers:", unique.size);
  console.log("Duplicate ticket numbers:", duplicates);
  console.log("DB total:", total, "DB available:", available);
  console.log("Oversold detected:", oversold);

  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  await db.end();
  process.exit(1);
});
