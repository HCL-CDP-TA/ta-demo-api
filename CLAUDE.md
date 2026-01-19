# CLAUDE.md

This file provides context for Claude Code when working on this project.

## Project Overview

TA Demo API - A Next.js API for orchestrating geofence-to-WhatsApp-to-reservation demo flow. Integrates with HCL Commerce for user/product/inventory data and coordinates with WhatsApp messaging and the Store Associate app.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Zod v4
- **Deployment**: Docker + Docker Compose
- **Real-time**: Server-Sent Events (SSE)
- **Commerce Integration**: HCL Commerce API SDK

## Architecture

**Data Sources:**
- **HCL Commerce API**: User profiles, wishlists, product details, inventory
- **Local Database**: Reservations, shopping centres, stores, activity logs

**Flow:**
1. Geofence event arrives with `user_id` and `locationId`
2. Fetch user profile and phone number from Commerce API
3. Fetch user's wishlist from Commerce API
4. Check inventory at `locationId` using Commerce API
5. If item in stock → create reservation with inline user/product data
6. Send WhatsApp message to user
7. User responds → SSE events to Store Associate app + CDP tracking

## Key Directories

- `app/api/` - API route handlers
- `lib/services/` - Business logic services
  - `commerce.service.ts` - HCL Commerce API integration
  - `reservation.service.ts` - Reservation management
  - `whatsapp.service.ts` - WhatsApp messaging
  - `sse.service.ts` - Server-Sent Events
  - `cdp.service.ts` - CDP tracking
- `lib/types/` - TypeScript type definitions
- `prisma/` - Database schema and migrations

## Important Endpoints

### POST `/api/webhooks/geofence-event`
Receives geofence enter/exit events. Fetches user/wishlist data from Commerce API and checks inventory.

**Payload structure:**
```json
{
  "app_id": "geofence",
  "event_type": "enter" | "exit",
  "user_id": "string",
  "geofence": {
    "id": "string",
    "name": "string",
    "locationId": "string",
    "coordinates": [{"lat": number, "lng": number}]
  },
  "position": {
    "latitude": number,
    "longitude": number,
    "accuracy": number
  },
  "timestamp": "ISO8601"
}
```

**Flow:**
1. Validates webhook with `WEBHOOK_API_KEY`
2. Calls `commerceService.getUserById(user_id)` for phone number
3. Calls `commerceService.getUserWishlist(user_id)` for wishlist items
4. Calls `commerceService.checkInventory(partNumbers, locationId)` for stock
5. Creates reservation with inline user/product data
6. Sends WhatsApp message with reservation details

### POST `/api/whatsapp/button-response`
Handles WhatsApp button clicks (Reserve Item / No Thanks).

### GET `/api/store-associate/events`
SSE endpoint for real-time updates to Store Associate app.

## Common Commands

```bash
# Development
npm run dev

# Database
npx prisma generate  # Generate Prisma client after schema changes
npm run db:push      # Push schema changes to database
npm run db:seed      # Seed demo data (shopping centres/stores)
npx prisma studio    # Database GUI

# Docker
./deploy.sh          # Deploy with Docker
docker logs -f ta-demo-api
```

## Environment Variables

**Required:**
```env
DATABASE_URL=postgresql://...
WEBHOOK_API_KEY=your-key
PHONE_EMULATOR_URL=http://localhost:3000
```

**HCL Commerce API:**
```env
COMMERCE_HOST_URL=https://your-commerce-host.com
COMMERCE_STORE_HOST=https://your-commerce-host.com
COMMERCE_TRANSACTION_CONTEXT=/wcs/resources
COMMERCE_SEARCH_CONTEXT=/search/resources
COMMERCE_STORE_ID=41
COMMERCE_CATALOG_ID=11501
COMMERCE_CONTRACT_ID=-41005
COMMERCE_VERSION=commerce-plus
COMMERCE_STORE_NAME=Ruby
COMMERCE_FULFILLMENT_CENTER=R00B2C

# Optional: Service account for admin access
COMMERCE_ADMIN_USER=admin
COMMERCE_ADMIN_PASSWORD=password
```

**Optional:**
```env
CDP_ENDPOINT=https://crux.dev.hxcd.now.hclsoftware.cloud
CDP_API_KEY=your-key
CDP_PASS_KEY=your-pass-key
ENABLE_CDP_TRACKING=true
ENABLE_WHATSAPP=true
ENABLE_SSE=true
```

## Code Conventions

- Use Zod for request validation
- Services are in `lib/services/` with `.service.ts` suffix
- Activity logging via `activityService.logActivity()`
- Graceful failures return `{ success: true, message: "...", reservationId: null }`
- Reservation model stores inline user/product data (no relations to User/Product tables)

## Database Schema

**Reservation** - Stores reservation with inline user/product data
- `commerceUserId` - HCL Commerce user ID
- `phoneNumber`, `userName` - User contact info
- `productPartNumber`, `productName`, `productBrand`, `productPrice`, `productImageUrl` - Product details
- `shoppingCentre`, `storeName`, `locationId` - Location info
- `status` - PENDING, CONFIRMED, DECLINED, EXPIRED, CANCELLED, COMPLETED

**ShoppingCentre** - Physical shopping centre locations
**Store** - Individual stores within shopping centres
**Activity** - Activity/event logs

## HCL Commerce Integration

The `commerceService` provides these methods:

- `getUserById(userId)` - Get user profile with phone number
- `getUserWishlist(userId)` - Get user's wishlist items
- `checkInventory(partNumbers, locationId)` - Check stock at location
- `getProductByPartNumber(partNumber)` - Get product details

**Note:** Commerce service authenticates with admin credentials if provided, otherwise operates in limited mode.
