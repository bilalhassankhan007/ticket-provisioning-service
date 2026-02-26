# Ticket Service - Environment Setup

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose

## Setup Instructions

### 1. Start PostgreSQL Database

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 with:
- Database: `tickets`
- Username: `postgres`
- Password: `postgres`

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize Database

```bash
npm run seed
```

### 4. Start Application

```bash
npm run dev
```

Server runs on http://localhost:3000

## Environment Variables

No additional configuration needed - uses default values:
- Database: `localhost:5432/tickets`
- API Server: `http://localhost:3000`

## Verify Setup

Test the API:
```bash
curl -X POST http://localhost:3000/purchase \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","eventId":"EVENT001","quantity":8}'
```

## Troubleshooting

### Database not connecting
```bash
docker-compose down -v
docker-compose up -d
```

### Port conflicts
Check ports 3000 and 5432 are available or modify in `docker-compose.yml`