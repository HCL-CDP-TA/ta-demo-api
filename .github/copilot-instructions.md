# GitHub Copilot Agent Instructions

## Project Context

You are working on **TA Demo API**, a Next.js 16 API that orchestrates a geofence-to-WhatsApp-to-reservation demo flow. This API integrates HCL Commerce, WhatsApp messaging, CDP tracking, and real-time Store Associate notifications.

### Key Documentation
- **CLAUDE.md**: Contains Claude-specific project context, architecture, and flow details
- **README.md**: Complete API documentation, setup instructions, and integration guides

**Always consult CLAUDE.md and README.md before making changes to understand the full context and existing patterns.**

---

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Zod v4
- **Real-time**: Server-Sent Events (SSE)
- **Commerce**: HCL Commerce API SDK

### Data Flow
1. **Geofence Event** → User enters shopping centre
2. **Offer Creation** → Fetch user/cart from Commerce API, create Offer (1hr TTL)
3. **WhatsApp Message** → Send offer with buttons via Phone Emulator
4. **Button Click** → Create & confirm reservation, notify Store Associate via SSE
5. **Confirmation** → Send WhatsApp confirmation (after 2s delay)
6. **CDP Tracking** → Track all events to HCL CDP

### Critical Pattern: Offer → Reservation Flow
- **Geofence event** creates an **Offer** (not a Reservation)
- Offer has UUID included in WhatsApp button URL: `?offerId={uuid}`
- Offer expires after 1 hour
- **Button click** creates **Reservation** from Offer data
- This separation allows tracking expired/declined offers

---

## Code Conventions

### File Organization
```
app/api/              # Route handlers (Next.js App Router)
lib/services/         # Business logic (*.service.ts)
lib/types/            # TypeScript types (*.types.ts)
lib/utils/            # Helper functions (*.helpers.ts)
prisma/              # Database schema and migrations
```

### Service Layer Pattern
All business logic belongs in `lib/services/*.service.ts`:
- `commerce.service.ts` - HCL Commerce API integration
- `offer.service.ts` - Offer management (1hr TTL)
- `reservation.service.ts` - Reservation CRUD
- `whatsapp.service.ts` - WhatsApp messaging
- `cdp.service.ts` - CDP event tracking
- `sse.service.ts` - Server-Sent Events
- `activity.service.ts` - Activity logging

### Request Validation
- Use Zod schemas for all request validation
- Define schemas inline or in separate files
- Validate early, return clear error messages

### Error Handling
- Graceful failures: `{ success: true, message: "...", reservationId: null }`
- Log all errors but don't expose internals to clients
- Use try-catch blocks in route handlers
- Service methods should throw descriptive errors

### Activity Logging
Always log significant events using `activityService.logActivity()`:
```typescript
await activityService.logActivity('GEOFENCE_ENTRY', {
  userId: '123',
  locationId: 'MC',
  // ... other relevant data
})
```

Activity types:
- `GEOFENCE_ENTRY`, `GEOFENCE_EXIT`
- `WHATSAPP_SENT`, `OFFER_DECLINED`
- `RESERVATION_CREATED`, `RESERVATION_CONFIRMED`
- `RESERVATION_DECLINED`, `RESERVATION_CANCELLED`

---

## Critical Implementation Details

### 1. Commerce Service Integration
The `commerceService` authenticates with HCL Commerce admin credentials:
```typescript
// Initialize once, reuse for all requests
await commerceService.initialize()
const user = await commerceService.getUserById(userId)
const cart = await commerceService.getUserCart(userId)
```

**Key methods:**
- `getUserById(userId)` - Get user profile with phone number
- `getUserCart(userId)` - Get cart items
- `checkInventory(partNumbers, locationId)` - Check stock
- `getProductByPartNumber(partNumber)` - Get product details

### 2. Offer Management
Offers have 1-hour TTL and use UUIDs:
```typescript
const offer = await offerService.createOffer({
  userId,
  phoneNumber,
  userName,
  productPartNumber,
  productName,
  // ... all required fields
})

// offerId is UUID like: "550e8400-e29b-41d4-a716-446655440000"
// Include in WhatsApp button URL: ?offerId={offer.id}
```

### 3. WhatsApp Message Flow
**Two message types:**

**Offer Message (sent at geofence entry):**
```typescript
await whatsappService.sendReservationMessage({
  phoneNumber,
  userName,
  productName,
  storeName,
  offerId, // UUID for button callback
})
```

**Confirmation Message (sent after reservation confirmed):**
```typescript
// Wait 2 seconds before sending confirmation
await new Promise(resolve => setTimeout(resolve, 2000))

await whatsappService.sendConfirmationMessage({
  phoneNumber,
  userName,
  productName,
  storeName,
  reservationDate,
})
```

### 4. SSE Events for Store Associate
Send TWO events when reservation is confirmed:
```typescript
// Event 1: VIP notification
sseService.sendEvent('customer_approaching', {
  type: 'customer_approaching',
  timestamp: new Date().toISOString(),
  vipStatus: 'Gold',
  customerName: userName,
  loyaltyTier: 'Gold',
})

// Event 2: Item reserved (toast + items on hold)
sseService.sendEvent('item_reserved', {
  type: 'item_reserved',
  timestamp: new Date().toISOString(),
  productName,
  reservationId,
  customerName: userName,
})
```

### 5. CDP Tracking
Track all significant events:
```typescript
await cdpService.trackEvent({
  eventType: 'WhatsApp Message Sent',
  userId,
  customData: {
    phoneNumber,
    productName,
    // ... other context
  }
})
```

Event types:
- `WhatsApp Message Sent` (offer + confirmation)
- `Item Reserved`
- `Offer Declined`

### 6. Reservation Data Model
Reservations store **inline data** (no foreign keys):
```typescript
{
  commerceUserId: string      // HCL Commerce user ID
  phoneNumber: string
  userName: string
  productPartNumber: string
  productName: string
  productBrand: string
  productPrice: number
  productImageUrl?: string
  shoppingCentre: string
  storeName: string
  locationId: string
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | ...
  geofenceEventData?: JSON    // Original event
  whatsappMessageId?: string
}
```

**Why inline data?** User/product data may change in Commerce system, but reservation should reflect data at time of reservation.

---

## Common Tasks

### Adding a New API Endpoint
1. Create route handler in `app/api/your-endpoint/route.ts`
2. Define Zod schema for request validation
3. Extract business logic to appropriate service
4. Log activity with `activityService.logActivity()`
5. Return consistent response format
6. Update README.md with endpoint documentation

### Adding a New Service Method
1. Add method to appropriate service in `lib/services/`
2. Use Prisma for database operations
3. Throw descriptive errors
4. Add TypeScript types in `lib/types/` if needed
5. Update CLAUDE.md if it affects key flows

### Adding a Database Field
1. Update `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name description`
3. Update TypeScript types
4. Update seed data in `prisma/seed.ts` if needed
5. Test with `npx prisma db push` and `npx prisma db seed`

### Adding CDP Tracking
1. Identify event to track
2. Add call to `cdpService.trackEvent()` in appropriate location
3. Include all relevant context in `customData`
4. Respect `ENABLE_CDP_TRACKING` feature flag
5. Document event type in CLAUDE.md

---

## Testing Approach

### Local Development
```bash
npm run dev                    # Start dev server
npx prisma studio             # View database
docker logs -f ta-demo-api    # View logs
```

### Testing Flow
1. **Send geofence event** → Check logs for offer creation
2. **Check Phone Emulator** → Verify WhatsApp message received
3. **Click "Reserve Item"** → Check reservation created
4. **Verify SSE events** → Store Associate should see notification
5. **Check CDP** → Verify events tracked

### Debugging Tips
- Check terminal logs for Prisma queries (enabled by default)
- Use `console.log()` liberally in services
- Check activity log: `select * from "Activity" order by timestamp desc`
- Verify offer not expired: `select * from "Offer" where "expiresAt" > now()`

---

## Environment Variables

### Required
```env
DATABASE_URL=postgresql://...
WEBHOOK_API_KEY=demo-webhook-secret-2025
PHONE_EMULATOR_URL=http://localhost:3001
```

### HCL Commerce
```env
COMMERCE_HOST_URL=https://...
COMMERCE_STORE_ID=41
COMMERCE_ADMIN_USER=admin
COMMERCE_ADMIN_PASSWORD=password
```

### Optional (Feature Flags)
```env
ENABLE_CDP_TRACKING=true
ENABLE_WHATSAPP=true
ENABLE_SSE=true
```

---

## Known Issues & Patterns

### Issue: "Cannot read properties of undefined (reading 'create')"
**Cause:** Prisma client not initialized or model doesn't exist
**Fix:** 
1. Check `prisma/schema.prisma` for model definition
2. Run `npx prisma generate`
3. Verify import: `import { prisma } from '@/lib/db'`

### Pattern: 2-Second Delay Before Confirmation
Always wait 2 seconds before sending WhatsApp confirmation to avoid appearing too automated:
```typescript
await new Promise(resolve => setTimeout(resolve, 2000))
```

### Pattern: Graceful CDP Failures
CDP tracking should never break the main flow:
```typescript
try {
  await cdpService.trackEvent(...)
} catch (error) {
  console.error('CDP tracking failed:', error)
  // Continue execution
}
```

### Pattern: Feature Flag Checks
Respect feature flags for optional functionality:
```typescript
if (process.env.ENABLE_WHATSAPP === 'true') {
  await whatsappService.sendMessage(...)
}
```

---

## Before Making Changes

1. **Read CLAUDE.md** - Understand the complete flow and architecture
2. **Read README.md** - Check existing API contracts and conventions
3. **Check related services** - Ensure you understand dependencies
4. **Review Prisma schema** - Verify data models exist
5. **Test locally** - Use Postman collection or curl commands
6. **Update documentation** - Keep CLAUDE.md and README.md current

---

## Contact & Support

This is a Technical Architecture demo project. For questions:
- Review CLAUDE.md and README.md first
- Check Postman collection for examples
- Consult existing route handlers for patterns
- Review service implementations for business logic

**Remember:** This API is the orchestration layer - it coordinates between HCL Commerce, WhatsApp, CDP, and Store Associate app. Keep it focused on integration, not business logic.
