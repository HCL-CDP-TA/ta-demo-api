# TA Demo API

API for orchestrating geofence-to-WhatsApp-to-reservation demo flow. Acts as the server-side backbone connecting geofence events, WhatsApp messaging, CDP tracking, and the Store Associate app.

## Overview

This Next.js API enables a seamless customer experience:

1. **Customer enters geofence** → Geofence app triggers API
2. **API finds wishlist item** → Sends personalized WhatsApp message
3. **Customer clicks "Reserve"** → Reservation confirmed
4. **Store associate notified** → Real-time SSE updates
5. **CDP tracks events** → Complete customer journey captured

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
│  Geofence   │────────▶│  HCL CDP    │────────▶│  TA Demo API     │
│     App     │         │  (webhook)  │         │  (this service)  │
└─────────────┘         └─────────────┘         └────────┬─────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────┐
                        │                                │                    │
                        ▼                                ▼                    ▼
              ┌──────────────────┐           ┌────────────────┐   ┌──────────────────┐
              │ Phone Emulator   │◀──────────│  User clicks   │   │ Store Associate  │
              │  (WhatsApp UI)   │           │    button      │   │   App (SSE)      │
              └──────────────────┘           └────────────────┘   └──────────────────┘
```

## Technology Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Docker + Docker Compose
- **Validation**: Zod v4
- **Real-time**: Server-Sent Events (SSE)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- PostgreSQL database accessible at `host.docker.internal:5432`
- Access to multitenant-network (created automatically by deploy script)

### Deployment

```bash
# 1. Clone the repository
git clone <repository-url>
cd ta-demo-api

# 2. Configure environment variables (optional)
# Edit .env file to update CDP credentials, etc.

# 3. Deploy using the deploy script
./deploy.sh

# 4. Seed the database with demo data
docker exec ta-demo-api npx prisma db seed

# 5. Verify deployment
curl http://localhost:3000
```

The API will be available at **http://localhost:3000**

### Development Mode

```bash
# Install dependencies
npm install

# Set up database
npm run db:push
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## API Endpoints

### Webhooks

#### POST `/api/webhooks/geofence-event`

Receives webhook when a user enters or exits a shopping centre geofence.

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <WEBHOOK_API_KEY>` (optional, for security)

**Request Body:**
```json
{
  "app_id": "geofence",
  "event_type": "enter",
  "user_id": "6",
  "geofence": {
    "id": "cmj7v3hmq000111parnxz7e34",
    "name": "MC",
    "coordinates": [
      { "lat": -33.77534, "lng": 151.12076 },
      { "lat": -33.77615, "lng": 151.12205 }
    ]
  },
  "position": {
    "latitude": -33.77643,
    "longitude": 151.12202,
    "accuracy": 10,
    "speed": null,
    "heading": null
  },
  "timestamp": "2026-01-14T03:17:27.316Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Geofence event processed successfully",
  "reservationId": "clxyz123456789",
  "whatsappSent": true
}
```

**Flow:**
1. Validates webhook request
2. Finds existing user in database (gracefully fails if not found)
3. Retrieves user's wishlist items for the shopping centre
4. Selects first in-stock item
5. Creates PENDING reservation (expires COB today)
6. Sends WhatsApp message via Phone Emulator
7. Logs activity to database

> **Note:** CDP tracking is handled elsewhere, not in this endpoint.

---

### WhatsApp

#### POST `/api/whatsapp/button-response`

Handles button clicks from WhatsApp messages sent via the Phone Emulator.

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "messageId": "2025-12-18T12:00:00.000Z",
  "buttonId": "reserve_item",
  "buttonText": "Reserve Item",
  "sender": "Zara",
  "senderNumber": "+1-800-SHOP",
  "payload": {
    "reservationId": "clxyz123456789",
    "action": "reserve"
  }
}
```

**Response (Reserve Item):**
```json
{
  "success": true,
  "message": "Reservation confirmed",
  "reservation": {
    "id": "clxyz123456789",
    "status": "CONFIRMED"
  }
}
```

**Response (No Thanks):**
```json
{
  "success": true,
  "message": "Reservation declined",
  "reservation": {
    "id": "clxyz123456789",
    "status": "DECLINED"
  }
}
```

**Flow (Reserve Item):**
1. Finds reservation by messageId or payload.reservationId
2. Updates reservation status to CONFIRMED
3. Sends TWO SSE events to Store Associate app:
   - `customer_approaching` → Displays VipNotification
   - `item_reserved` → Shows Toast + updates Items on Hold
4. Tracks "Item Reserved" event to CDP
5. Logs all activities

**Flow (No Thanks):**
1. Updates reservation status to DECLINED
2. Tracks "Reservation Declined" event to CDP
3. Logs activity

---

## Database Schema

### Key Models

**User**
- `id`, `userId`, `phoneNumber`, `name`, `email`
- Relationships: reservations, wishlists

**Product**
- `sku`, `name`, `brand`, `price`, `imageUrl`
- `shoppingCentre`, `storeName`, `storeLocation`
- `stockQuantity`, `inStock`
- Support for external API integration (`externalId`, `externalSource`)

**Reservation**
- Links user to product
- Status: PENDING, CONFIRMED, DECLINED, EXPIRED, CANCELLED, COMPLETED
- Timestamps: createdAt, expiresAt, confirmedAt
- Stores geofence event data and WhatsApp messageId

**Activity**
- Event logging: GEOFENCE_ENTRY, WHATSAPP_SENT, RESERVATION_CREATED, etc.
- JSON data field for flexible event details
- Indexed by type and timestamp

### Demo Data

After running `npx prisma db seed`, you'll have:

**Users:**
- user-001: Sarah Johnson (+1-555-0001) - VIP Gold
- user-002: Emily Chen (+1-555-0002) - VIP Platinum
- user-003: Michael Rodriguez (+1-555-0003) - Silver

**Products:**
- ZARA-DRESS-001: Floral Print Midi Dress ($89.99)
- ZARA-JACKET-002: Leather Biker Jacket ($129.99)
- ZARA-SHOES-003: Ankle Boots ($79.99)
- ZARA-BLAZER-004: Tailored Blazer ($119.99)
- HM-SWEATER-001: Cashmere Blend Sweater ($49.99)
- HM-JEANS-002: High-Waisted Slim Jeans ($39.99)

**Shopping Centres:**
- Westfield Mall (geofence-001)
  - Zara (Level 2, Zone A)
  - H&M (Level 1, Zone B)

---

## Environment Variables

Configuration via `.env` file:

```bash
# Database
DATABASE_URL="postgresql://multitenant_user:multitenant_password@host.docker.internal:5432/ta_demo"

# Phone Emulator Integration
PHONE_EMULATOR_URL="http://host.docker.internal:3001"

# CDP Integration
CDP_ENDPOINT="https://crux.dev.hxcd.now.hclsoftware.cloud"
CDP_API_KEY="your-api-key-here"
CDP_PASS_KEY="your-pass-key-here"

# Webhook Security
WEBHOOK_API_KEY="demo-webhook-secret-2025"

# Business Rules
COB_TIME="17:00"
DEFAULT_SHOPPING_CENTRE="Westfield Mall"

# Feature Flags
ENABLE_CDP_TRACKING=true
ENABLE_WHATSAPP=true
ENABLE_SSE=true
```

---

## Services

### WhatsApp Service
Sends reservation messages to Phone Emulator with interactive buttons.

### CDP Service
Tracks events to HCL CDP using x-api-key authentication.

### SSE Service
Manages Server-Sent Events connections for real-time updates to Store Associate app.

### Reservation Service
CRUD operations for reservations with status management.

### Product Service
Wishlist queries, product searches, stock management.

### Activity Service
Event logging and dashboard statistics.

---

## Postman Collection

Import the Postman collection for easy API testing:

**File:** `TA-Demo-API.postman_collection.json`

**Collection includes:**
- Geofence Event webhook example
- WhatsApp Button Response examples (Reserve Item, No Thanks)
- Sample responses
- Environment variables

**Variables:**
- `baseUrl`: http://localhost:3000
- `webhookApiKey`: demo-webhook-secret-2025

---

## Docker Commands

```bash
# View logs
docker logs -f ta-demo-api

# Access container shell
docker exec -it ta-demo-api sh

# Run database migrations
docker exec ta-demo-api npx prisma migrate deploy

# Seed database
docker exec ta-demo-api npx prisma db seed

# View Prisma Studio (database GUI)
docker exec -it ta-demo-api npx prisma studio

# Access PostgreSQL
docker exec -it ta-demo-api psql postgresql://multitenant_user:multitenant_password@host.docker.internal:5432/ta_demo

# Restart container
docker-compose restart

# Rebuild and redeploy
docker-compose down && docker-compose build && docker-compose up -d

# Stop and remove
docker-compose down
```

---

## Testing

### Manual Testing Flow

1. **Test Geofence Event:**
```bash
curl -X POST http://localhost:3000/api/webhooks/geofence-event \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo-webhook-secret-2025" \
  -d '{
    "app_id": "geofence",
    "event_type": "enter",
    "user_id": "1",
    "geofence": {
      "id": "geofence-001",
      "name": "Westfield Mall",
      "coordinates": [{"lat": -33.775, "lng": 151.120}]
    },
    "position": {
      "latitude": -33.776,
      "longitude": 151.122,
      "accuracy": 10,
      "speed": null,
      "heading": null
    },
    "timestamp": "2026-01-14T12:00:00Z"
  }'
```

2. **Check Phone Emulator** (http://localhost:3001) for WhatsApp message

3. **Click "Reserve Item"** in Phone Emulator

4. **Test Button Response:**
```bash
curl -X POST http://localhost:3000/api/whatsapp/button-response \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "2025-12-18T12:00:00.000Z",
    "buttonId": "reserve_item",
    "buttonText": "Reserve Item",
    "sender": "Zara",
    "senderNumber": "+1-800-SHOP",
    "payload": {
      "reservationId": "clxyz123456789",
      "action": "reserve"
    }
  }'
```

---

## Project Structure

```
ta-demo-api/
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   └── geofence-event/route.ts
│   │   └── whatsapp/
│   │       └── button-response/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── db.ts
│   ├── services/
│   │   ├── whatsapp.service.ts
│   │   ├── cdp.service.ts
│   │   ├── sse.service.ts
│   │   ├── reservation.service.ts
│   │   ├── product.service.ts
│   │   └── activity.service.ts
│   ├── types/
│   │   ├── cdp.types.ts
│   │   ├── whatsapp.types.ts
│   │   └── sse.types.ts
│   └── utils/
│       └── date.helpers.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
├── deploy.sh
├── .env
└── TA-Demo-API.postman_collection.json
```

---

## Integration Guide

### Connecting with Geofence App

Configure the Geofence app to send webhooks to this API:

1. Set `GEOFENCE_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/geofence-event`
2. Ensure both apps are on the same Docker network (`multitenant-network`)
3. User IDs must match between systems (user must already exist in database)

### Connecting with Phone Emulator

1. Deploy Phone Emulator at `http://localhost:3001`
2. Set `PHONE_EMULATOR_URL=http://host.docker.internal:3001` in .env
3. Phone Emulator must be accessible from Docker container

### Connecting with Store Associate App

1. Store Associate app connects via SSE (coming soon)
2. Set `VITE_TA_DEMO_API_URL=http://localhost:3000` in Store Associate app
3. SSE endpoint: `GET /api/store-associate/events` (in development)

---

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection from container
docker exec ta-demo-api pg_isready -h host.docker.internal -p 5432 -U multitenant_user

# View database logs
docker logs ta-demo-api | grep -i postgres
```

### Prisma Issues

```bash
# Regenerate Prisma client
docker exec ta-demo-api npx prisma generate

# Reset database (WARNING: deletes all data)
docker exec ta-demo-api npx prisma migrate reset

# View migration status
docker exec ta-demo-api npx prisma migrate status
```

### Network Issues

```bash
# Check if multitenant-network exists
docker network ls | grep multitenant

# Create network if missing
docker network create multitenant-network

# Verify container is on the network
docker network inspect multitenant-network
```

---

## Roadmap

### Phase 1 (Completed ✅)
- ✅ Database schema and migrations
- ✅ Geofence event webhook
- ✅ WhatsApp button response
- ✅ Service layer (WhatsApp, CDP, SSE, Reservation, Product, Activity)
- ✅ Docker deployment
- ✅ Postman collection
- ✅ API documentation

### Phase 2 (In Progress 🚧)
- 🚧 Store Associate SSE stream endpoint
- 🚧 Store Associate reservations query endpoint
- 🚧 Dashboard stats endpoint
- 🚧 Dashboard activity feed endpoint
- 🚧 Dashboard UI components

### Phase 3 (Planned 📋)
- External product API integration
- Multi-store support
- Reservation expiry automation
- Advanced analytics

---

## Contributing

This is a demo application for Technical Architecture presentations. For questions or issues, please contact the development team.

---

## License

Proprietary - HCL Software
