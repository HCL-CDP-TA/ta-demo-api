import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { commerceService } from "@/lib/services/commerce.service"
import { whatsappService } from "@/lib/services/whatsapp.service"
import { activityService } from "@/lib/services/activity.service"
import { cdpService } from "@/lib/services/cdp.service"
import { ActivityType } from "@prisma/client"

// Validation schema for geofence event webhook
const geofenceEventSchema = z.object({
  app_id: z.string(),
  event_type: z.enum(["enter", "exit"]),
  user_id: z.string(),
  geofence: z.object({
    id: z.string(),
    name: z.string(),
    locationId: z.string(), // Commerce store/fulfillment center ID
    coordinates: z.array(
      z.object({
        lat: z.number(),
        lng: z.number(),
      }),
    ),
  }),
  position: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number().optional(),
    speed: z.number().nullable().optional(),
    heading: z.number().nullable().optional(),
  }),
  timestamp: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    // Validate webhook API key
    const apiKey = request.headers.get("x-api-key")
    const expectedApiKey = process.env.WEBHOOK_API_KEY

    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const data = geofenceEventSchema.parse(body)

    console.log(
      `[Geofence Webhook] Received ${data.event_type} event for user ${data.user_id} at ${data.geofence.name}`,
    )

    // 1. Fetch user from Commerce API
    const commerceUser = await commerceService.getUserById(data.user_id)

    if (!commerceUser || !commerceUser.phone1) {
      console.log(`[Geofence Webhook] User ${data.user_id} not found or has no phone number`)
      return NextResponse.json({
        success: true,
        message: `User profile incomplete - phone number required for notifications`,
        reservationId: null,
      })
    }

    const userName = [commerceUser.firstName, commerceUser.lastName].filter(Boolean).join(" ") || "there"

    // Log activity
    await activityService.logActivity(ActivityType.GEOFENCE_ENTRY, {
      userId: data.user_id,
      geofenceId: data.geofence.id,
      geofenceName: data.geofence.name,
      locationId: data.geofence.locationId,
      eventType: data.event_type,
      phoneNumber: commerceUser.phone1,
      position: data.position,
    })

    // 2. Fetch user's shopping cart from Commerce API
    const cartItems = await commerceService.getUserCart(data.user_id)

    if (cartItems.length === 0) {
      console.log(`[Geofence Webhook] No cart items found for user ${data.user_id}`)
      return NextResponse.json({
        success: true,
        message: `User ${userName} has no items in their cart`,
        reservationId: null,
      })
    }

    // 3. Check inventory at the location for cart items (SKIPPED FOR TESTING)
    // TODO: Re-enable inventory check for production
    // const partNumbers = cartItems.map(item => item.partNumber).filter(Boolean)
    // const inventoryItems = await commerceService.checkInventory(partNumbers, data.geofence.locationId)
    // const inStockItem = inventoryItems.find(item => item.inStock)

    // For testing: Just use first cart item regardless of stock
    const firstItem = cartItems[0]
    console.log(`[Geofence Webhook] Using first cart item (testing mode): ${firstItem.partNumber}`)

    // 4. Cart items already contain all product details, no need for separate lookup
    console.log(`[Geofence Webhook] Cart item details:`, JSON.stringify(firstItem, null, 2))

    // 5. Send WhatsApp offer message (NO reservation created yet - that happens when user confirms)
    const result = await whatsappService.sendReservationMessage({
      phoneNumber: commerceUser.phone1,
      userName: userName,
      productName: firstItem.name || `Product ${firstItem.partNumber}`,
      productPartNumber: firstItem.partNumber,
      productBrand: firstItem.manufacturer,
      productPrice: firstItem.unitPrice,
      productImageUrl: firstItem.thumbnail,
      storeName: data.geofence.name,
      shoppingCentre: data.geofence.name,
      locationId: data.geofence.locationId,
      userId: data.user_id,
      geofenceEventData: {
        geofenceId: data.geofence.id,
        position: data.position,
        timestamp: data.timestamp,
      },
      reservationId: null, // No reservation yet - will be created when user confirms
    })

    // 6. Log WhatsApp message sent
    if (result.success && result.messageId && result.offerId) {
      // Log that WhatsApp message was sent with offer ID
      await activityService.logActivity(ActivityType.WHATSAPP_SENT, {
        userId: data.user_id,
        phoneNumber: commerceUser.phone1,
        productPartNumber: firstItem.partNumber,
        messageId: result.messageId,
        offerId: result.offerId,
      })

      // Track WhatsApp message sent to CDP
      await cdpService.trackWhatsAppSent({
        userId: data.user_id,
        phoneNumber: commerceUser.phone1,
        productName: firstItem.name || `Product ${firstItem.partNumber}`,
        storeName: data.geofence.name,
        messageId: result.messageId,
      })

      await activityService.logActivity(ActivityType.CDP_EVENT_TRACKED, {
        event: "WhatsApp Message Sent",
        userId: data.user_id,
        messageId: result.messageId,
      })

      console.log(`[Geofence Webhook] WhatsApp offer sent - messageId: ${result.messageId}, offerId: ${result.offerId}`)
    } else {
      console.warn(`[Geofence Webhook] WhatsApp message failed: ${result.error}`)
    }

    return NextResponse.json({
      success: true,
      message: "Offer message sent to customer",
      messageId: result.messageId,
      offerId: result.offerId,
      whatsappSent: result.success,
    })
  } catch (error) {
    console.error("[Geofence Webhook] Error:", error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
