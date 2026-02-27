import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

async function seedDatabase() {
  try {
    console.log("Starting database seeding...");

    // Clear existing data (IMPORTANT: clear allocations too)
    await pool.query(
      "TRUNCATE TABLE issued_tickets, ticket_allocations CASCADE",
    );
    await pool.query("DELETE FROM ticket_pools");

    // Insert events with larger ticket totals
    const events = [
      {
        id: "EVENT001",
        name: "Summer Music Festival",
        total: 5000,
        available: 4800,
        soldTickets: 200, // 25 purchases of 8 tickets
      },
      {
        id: "EVENT002",
        name: "Tech Conference 2024",
        total: 3000,
        available: 2920,
        soldTickets: 80, // 10 purchases of 8 tickets
      },
      {
        id: "EVENT003",
        name: "Food & Wine Expo",
        total: 2500,
        available: 2340,
        soldTickets: 160, // 20 purchases of 8 tickets
      },
      {
        id: "EVENT004",
        name: "Comedy Night",
        total: 1500,
        available: 1500,
        soldTickets: 0, // No tickets sold yet
      },
      {
        id: "EVENT005",
        name: "Art Gallery Opening",
        total: 2000,
        available: 1976,
        soldTickets: 24, // 3 purchases of 8 tickets
      },
      {
        id: "EVENT006",
        name: "Rock Concert",
        total: 4000,
        available: 3200,
        soldTickets: 800, // 100 purchases of 8 tickets - partially sold
      },
    ];

    // Insert ticket pools (includes next_ticket_number)
    for (const event of events) {
      const nextTicketNumber = event.soldTickets + 1;

      await pool.query(
        "INSERT INTO ticket_pools (event_id, total, available, next_ticket_number) VALUES ($1, $2, $3, $4)",
        [event.id, event.total, event.available, nextTicketNumber],
      );

      console.log(
        `Created ${event.id}: ${event.name} - Total: ${event.total}, Available: ${event.available}, Sold: ${event.soldTickets}`,
      );
    }

    // Insert issued tickets for each event (kept for consistency checks / legacy)
    for (const event of events) {
      if (event.soldTickets > 0) {
        for (let i = 1; i <= event.soldTickets; i++) {
          const userId = `user_${Math.floor((i - 1) / 8) + 1}_${event.id}`;
          await pool.query(
            "INSERT INTO issued_tickets (event_id, user_id, ticket_number) VALUES ($1, $2, $3)",
            [event.id, userId, i],
          );
        }
      }
    }

    console.log("\nSample issued tickets created");

    // Verify data consistency (issued_tickets)
    const verifyQuery = await pool.query(`
      SELECT
        tp.event_id,
        tp.total,
        tp.available,
        tp.next_ticket_number,
        COUNT(it.id)::int as issued_count,
        (tp.total - tp.available) as should_be_issued,
        CASE
          WHEN COUNT(it.id) = (tp.total - tp.available) THEN 'OK'
          ELSE 'MISMATCH!'
        END as status
      FROM ticket_pools tp
      LEFT JOIN issued_tickets it ON tp.event_id = it.event_id
      GROUP BY tp.event_id, tp.total, tp.available, tp.next_ticket_number
      ORDER BY tp.event_id
    `);

    console.log("\n=== Data Consistency Check ===");
    console.table(verifyQuery.rows);

    console.log("\nDatabase seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
