import express, { Request, Response } from "express";
import { purchaseTickets } from "./ticketService";

interface PurchaseRequest {
  userId: string;
  eventId: string;
  quantity: number;
}

interface PurchaseResponse {
  success: boolean;
  tickets?: number[];
  error?: string;
}

const app = express();
app.use(express.json());

app.post(
  "/purchase",
  async (
    req: Request<{}, {}, PurchaseRequest>,
    res: Response<PurchaseResponse>,
  ) => {
    try {
      const { userId, eventId, quantity } = req.body;

      if (!userId || !eventId || !quantity) {
        res.status(400).json({
          success: false,
          error: "Missing userId, eventId, or quantity",
        });
        return;
      }

      if (quantity % 8 !== 0) {
        res.status(400).json({
          success: false,
          error: "Quantity must be a multiple of 8",
        });
        return;
      }

      const tickets = await purchaseTickets(userId, eventId, quantity);

      res.json({
        success: true,
        tickets,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

const PORT = 3000;

async function waitForDatabase(maxRetries = 30): Promise<void> {
  const { Pool } = await import("pg");
  const testPool = new Pool({
    host: "localhost",
    port: 5433,
    database: "tickets",
    user: "postgres",
    password: "postgres",
  });

  for (let i = 0; i < maxRetries; i++) {
    try {
      await testPool.query("SELECT 1");
      console.log("Database is ready");
      await testPool.end();
      return;
    } catch (error) {
      console.log(`Waiting for database... (attempt ${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Database connection timeout");
}

waitForDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
