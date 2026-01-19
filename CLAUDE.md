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
  - `offer.service.ts` - Temporary offer management (1 hour TTL)
  - `reservation.service.ts` - Reservation management
  - `whatsapp.service.ts` - WhatsApp messaging (offer + confirmation)
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
3. Calls `commerceService.getUserCart(user_id)` for cart items
4. Creates an Offer record in database with UUID (expires in 1 hour)
5. Sends WhatsApp message with buttons containing `offerId` in URL query parameter
6. Tracks "WhatsApp Message Sent" event to CDP
7. Logs activity

**Note:** No reservation is created at this stage - only an Offer. Reservation is created when user clicks "Reserve Item".

### POST `/api/whatsapp/button-response?offerId={uuid}`
Handles WhatsApp button clicks (Reserve Item / No Thanks).

**Query Parameters:**
- `offerId` (required) - UUID of the offer to process

**Flow (Reserve Item):**
1. Looks up Offer by UUID from database
2. Validates offer hasn't expired (1 hour TTL)
3. Creates PENDING reservation from offer data
4. Immediately confirms reservation
5. Sends TWO SSE events to Store Associate app:
   - `customer_approaching` → VipNotification
   - `item_reserved` → Toast + Items on Hold
6. Tracks "Item Reserved" to CDP
7. **Waits 2 seconds**
8. Sends WhatsApp confirmation message to customer
9. Tracks "WhatsApp Message Sent" to CDP

**Flow (No Thanks):**
1. Looks up Offer by UUID
2. Logs decline activity
3. Tracks "Offer Declined" to CDP

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

**Offer** - Temporary offer storage (expires in 1 hour)
- `id` (UUID) - Unique identifier included in WhatsApp button URL
- `userId`, `phoneNumber`, `userName` - User info from Commerce API
- `productPartNumber`, `productName`, `productBrand`, `productPrice`, `productImageUrl` - Product details
- `storeName`, `shoppingCentre`, `locationId` - Location info
- `geofenceEventData` - Original geofence event details
- `expiresAt` - Auto-expires 1 hour after creation

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
