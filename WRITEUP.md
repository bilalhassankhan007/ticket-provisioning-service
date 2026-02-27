# Ticket Service — Concurrency Bug Fix

A ticket provisioning backend for high-demand events where users purchase tickets in multiples of 8 (8, 16, 24, 32...). This write-up documents the root cause, reproduction, fix, and bonus scaling approach (multi-instance + high performance).

Repository (assignment): https://github.com/markopolo-inc/swe-1-assignment  
Local API (default): http://localhost:3000  
Purchase endpoint: http://localhost:3000/purchase

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
  - [1.1 What problem this service solves](#11-what-problem-this-service-solves)
  - [1.2 Success criteria (Done means...)](#12-success-criteria-done-means)
  - [1.3 Tech stack used](#13-tech-stack-used)
- [2. Repository Structure](#2-repository-structure)
- [3. Setup & Initialization (Local)](#3-setup--initialization-local)
  - [3.1 Prerequisites](#31-prerequisites)
  - [3.2 Clone the repo](#32-clone-the-repo)
  - [3.3 Start PostgreSQL (Docker)](#33-start-postgresql-docker)
  - [3.4 Install dependencies](#34-install-dependencies)
  - [3.5 Seed the database](#35-seed-the-database)
  - [3.6 Run the server](#36-run-the-server)
  - [3.7 Verify the API](#37-verify-the-api)
- [4. Root Cause Analysis (Bug Explanation)](#4-root-cause-analysis-bug-explanation)
  - [4.1 Why overselling happened](#41-why-overselling-happened)
  - [4.2 Why duplicate ticket numbers happened](#42-why-duplicate-ticket-numbers-happened)
  - [4.3 Why it only shows up under high concurrency](#43-why-it-only-shows-up-under-high-concurrency)
- [5. Reproduction (Reliable Scripts)](#5-reproduction-reliable-scripts)
  - [5.1 Bug reproduction script](#51-bug-reproduction-script)
  - [5.2 Expected buggy output](#52-expected-buggy-output)
- [6. Fix Implemented (Correctness)](#6-fix-implemented-correctness)
  - [6.1 Core fix strategy](#61-core-fix-strategy)
  - [6.2 Database changes](#62-database-changes)
  - [6.3 Application changes](#63-application-changes)
  - [6.4 Why the fix works](#64-why-the-fix-works)
- [7. Bonus: Multi-Instance Scaling Proof](#7-bonus-multi-instance-scaling-proof)
  - [7.1 Running two server instances](#71-running-two-server-instances)
  - [7.2 Multi-instance stress test](#72-multi-instance-stress-test)
  - [7.3 Expected output](#73-expected-output)
- [8. Bonus: High Performance (Write Amplification Reduction)](#8-bonus-high-performance-write-amplification-reduction)
  - [8.1 Problem with 1 row per ticket at scale](#81-problem-with-1-row-per-ticket-at-scale)
  - [8.2 Range allocation model](#82-range-allocation-model)
  - [8.3 Tradeoffs](#83-tradeoffs)
- [9. Conclusion](#9-conclusion)

---

## 1. Project Overview

### 1.1 What problem this service solves

This ticket provisioning service is responsible for:

- Selling tickets for events under heavy load (hundreds/thousands of users buying at the same time)
- Enforcing ticket purchase quantities in multiples of 8 (8, 16, 24, 32…)
- Ensuring every ticket issued under an event has a unique ticket number
- Preventing overselling (never sell more than the event’s allocated total)

### 1.2 Success criteria (Done means...)

Done means:

- Under high concurrency:
  - No overselling (available never goes negative, issued never exceeds total)
  - No duplicate ticket numbers per event
- System remains correct even with multiple running instances
- Reproduction scripts reliably show the bug in the original version and prove the fix in the updated version

### 1.3 Tech stack used

- Language: TypeScript
- Runtime: Node.js 18+
- Web framework: Express
- Database: PostgreSQL 15 (Docker container)
- DB client: pg (node-postgres)
- Dev tooling: ts-node, nodemon
- Scripts: TypeScript scripts using Node fetch()

---

## 2. Repository Structure

.
├── src/
│ ├── server.ts # Express API server (POST /purchase)
│ ├── ticketService.ts # Core ticket allocation logic (fixed)
│ └── seed.ts # Seeds ticket_pools and sample data
├── scripts/
│ ├── reproduce-bugs.ts # Reproduces oversell + duplicates on buggy logic
│ └── multi-instance-stress.ts # Proof across multiple instances
├── init.sql # DB schema init (tables + constraints)
├── docker-compose.yml # Postgres container config
├── package.json # Scripts + dependencies
└── tsconfig.json # TS compiler settings

---

## 3. Setup & Initialization (Local)

### 3.1 Prerequisites

- Node.js 18+
- Docker Desktop (with Docker Compose)
- Optional: VS Code

### 3.2 Clone the repo

git clone https://github.com/markopolo-inc/swe-1-assignment.git  
cd swe-1-assignment

### 3.3 Start PostgreSQL (Docker)

docker compose up -d  
docker compose ps

Postgres runs on:

- Host: localhost
- Port: 5433
- DB: tickets
- User: postgres
- Password: postgres

### 3.4 Install dependencies

npm install

### 3.5 Seed the database

npm run seed

### 3.6 Run the server

npm run dev

Server runs on: http://localhost:3000

### 3.7 Verify the API

PowerShell (Windows):
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/purchase" -ContentType "application/json" -Body '{"userId":"test","eventId":"EVENT001","quantity":8}'

---

## 4. Root Cause Analysis (Bug Explanation)

The original buggy flow effectively did:

1. SELECT ticket_pools for the event
2. Validate available >= quantity
3. Compute next ticket numbers based on (total - available)
4. Insert issued tickets (loop)
5. Update available = available - quantity

This creates a race condition.

### 4.1 Why overselling happened

- Two (or more) requests can read the same available value before either one updates it
- They all pass the availability check
- They all subtract from available
- Result: available can go below 0 and total issued exceeds the event’s total

### 4.2 Why duplicate ticket numbers happened

- Ticket numbers were derived from a stale snapshot:
  - currentTotal = total - available
- Under concurrency, multiple requests compute the same currentTotal, so they generate the same ticket numbers for the same event
- The database had no uniqueness constraint to prevent duplicates at write time

### 4.3 Why it only shows up under high concurrency

The main problem is a read-compute-write flow without:

- a transaction boundary
- an atomic reserve tickets operation
- a DB constraint preventing duplicates

Correctness relied on timing, not guarantees.

---

## 5. Reproduction (Reliable Scripts)

### 5.1 Bug reproduction script

Script: scripts/reproduce-bugs.ts

Run:
npx ts-node scripts/reproduce-bugs.ts

What it does:

- Forces a tiny event state: total=8, available=8
- Fires 30 concurrent purchase requests (each buying 8)
- Measures duplicates and oversell

### 5.2 Expected buggy output

On the original logic, output includes:

- Duplicate ticket numbers: > 0
- Oversold detected: true
- DB available: negative

Example (from my run):

- Successful purchases: 30
- Tickets returned: 240
- Unique ticket numbers: 8
- Duplicate ticket numbers: 232
- DB total: 8, DB available: -232
- Oversold detected: true

---

## 6. Fix Implemented (Correctness)

### 6.1 Core fix strategy

Make allocation atomic and transactional:

1. In a transaction:
   - atomically reserve tickets (only if enough remaining)
   - allocate a unique ticket number range
2. Persist the allocation
3. Commit

### 6.2 Database changes

Changes in init.sql:

- Added next_ticket_number to ticket_pools (monotonic allocator per event)
- Added UNIQUE(event_id, ticket_number) to issued_tickets (hard safety net)
- Added ticket_allocations table (bonus high-performance mode)

### 6.3 Application changes

In purchaseTickets():

- use BEGIN / COMMIT / ROLLBACK
- perform a single atomic gate:

```sql
UPDATE ticket_pools
SET
  available = available - $qty,
  next_ticket_number = next_ticket_number + $qty
WHERE event_id = $eventId
  AND available >= $qty
RETURNING
  (next_ticket_number - $qty) AS start_ticket,
  (next_ticket_number - 1)    AS end_ticket;

```

Then:

- Correctness mode: insert issued tickets using a single batch insert (generate_series), OR
- Bonus mode: insert one row into ticket_allocations (one write per purchase)

### 6.4 Why the fix works

- Overselling is prevented because reservation happens atomically (UPDATE ... WHERE available >= qty)
- Duplicate numbers are prevented because each request receives a unique range from next_ticket_number
- DB uniqueness constraint guarantees no duplicates even if app logic regresses
- Works across multiple running instances because synchronization is done at the DB row level

## 7. Bonus: Multi-Instance Scaling Proof

### 7.1 Running two server instances

server.ts supports overriding the port:

- default: 3000
- second instance: 3001

Terminal 1:

- npm run dev

Terminal 2 (PowerShell):

- $env:PORT=3001
- npm run dev

### 7.2 Multi-instance stress test

Script: scripts/multi-instance-stress.ts

Run:

- npx ts-node scripts/multi-instance-stress.ts

### 7.3 Expected output

Expected:

- Duplicate ticket numbers: 0
- Oversold detected: false
- Tickets returned equals total allocation

Example (from my run):

- Successful purchases: 10
- Tickets returned: 80
- Unique ticket numbers: 80
- Duplicate ticket numbers: 0
- DB total: 80, DB available: 0
- Oversold detected: false

## 8. Bonus: High Performance (Write Amplification Reduction)

### 8.1 Problem with 1 row per ticket at scale

At very high QPS:

- Each purchase of 32 tickets produces 32 inserted rows
- DB becomes write-bound quickly

### 8.2 Range allocation model

Instead of inserting 8/16/24/32 rows:

- Allocate [start_ticket..end_ticket]
- Insert one row in ticket_allocations
- Return tickets by expanding the range in memory

This reduces DB writes from O(quantity) to O(1) per purchase.

### 8.3 Tradeoffs

Pros:

- Much lower write load
- Better throughput at very high concurrency

Cons:

- If downstream needs per-ticket rows, you either:
  - expand ranges asynchronously, or
  - keep issued_tickets as a derived table

## 9. Conclusion

The original service failed under high demand due to a non-atomic, non-transactional allocation flow. The fix makes ticket allocation transactional, enforces correctness at the DB level via constraints, and proves correctness under concurrency and multi-instance scenarios. For high-scale workloads, the range allocation model reduces database write amplification significantly and can support much higher throughput while preserving correctness.
