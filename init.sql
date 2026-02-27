CREATE TABLE IF NOT EXISTS ticket_pools (
    event_id VARCHAR(50) PRIMARY KEY,
    total INTEGER NOT NULL CHECK (total >= 0),
    available INTEGER NOT NULL CHECK (available >= 0),
    next_ticket_number INTEGER NOT NULL DEFAULT 1 CHECK (next_ticket_number >= 1)
);

CREATE TABLE IF NOT EXISTS issued_tickets (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    ticket_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_issued_tickets_event_id
    ON issued_tickets(event_id);

CREATE TABLE IF NOT EXISTS ticket_allocations (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    start_ticket INTEGER NOT NULL,
    end_ticket INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_ticket >= 1),
    CHECK (end_ticket >= start_ticket),
    UNIQUE (event_id, start_ticket)
);

CREATE INDEX IF NOT EXISTS idx_ticket_allocations_event_id
    ON ticket_allocations(event_id);