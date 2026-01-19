import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { reservationService } from "@/lib/services/reservation.service"
import { sseService } from "@/lib/services/sse.service"
import { cdpService } from "@/lib/services/cdp.service"
import { activityService } from "@/lib/services/activity.service"
import { offerService } from "@/lib/services/offer.service"
import { whatsappService } from "@/lib/services/whatsapp.service"
import { ActivityType } from "@prisma/client"
import { calculateETA } from "@/lib/utils/date.helpers"

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Validation schema for button click
const buttonClickSchema = z.object({
  messageId: z.string(),
  buttonId: z.string(),
  buttonText: z.string(),
  sender: z.string(),
  senderNumber: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(), // Keep for backward compatibility but we don't use it
})

export async function POST(request: NextRequest) {
  try {
    // Extract offerId from URL query parameter
    const url = new URL(request.url)

    console.log(`[Button Response] Parsed URL: ${url.toString()}`)

    const offerId = url.searchParams.get("offerId")

    if (!offerId) {
      console.warn(`[Button Response] Missing offerId in URL`)
      return NextResponse.json({ success: false, error: "Missing offer ID" }, { status: 400 })
    }

    console.log(`[Button Response] Looking up offer: ${offerId}`)

    // Look up the offer from the database
    const offer = await offerService.getOfferById(offerId)

    if (!offer) {
      console.warn(`[Button Response] Offer not found or expired: ${offerId}`)
      return NextResponse.json({ success: false, error: "Offer not found or expired" }, { status: 404 })
    }

    // Parse and validate request body
    const body = await request.json()
    const data = buttonClickSchema.parse(body)

    console.log(`[Button Response] Received click: ${data.buttonId} for message ${data.messageId}`)

    // Handle based on button ID
    if (data.buttonId === "reserve_item" || data.payload?.action === "reserve") {
      // CREATE NEW RESERVATION from offer data (created as PENDING)
      let reservation = await reservationService.createReservation({
        commerceUserId: offer.userId,
        phoneNumber: offer.phoneNumber,
        userName: offer.userName || offer.phoneNumber,
        productPartNumber: offer.productPartNumber,
        productName: offer.productName,
        productBrand: offer.productBrand,
        productPrice: offer.productPrice ? parseFloat(offer.productPrice) : undefined,
        productImageUrl: offer.productImageUrl,
        storeName: offer.storeName,
        shoppingCentre: offer.shoppingCentre,
        locationId: offer.locationId,
        messageId: data.messageId,
        geofenceEventData: offer.geofenceEventData,
      })

      console.log(`[Button Response] Reservation created: ${reservation.id}`)

      // Log reservation creation
      await activityService.logActivity(ActivityType.RESERVATION_CREATED, {
        reservationId: reservation.id,
        userId: reservation.commerceUserId,
        productSku: reservation.productPartNumber,
      })

      // Immediately confirm the reservation
      reservation = await reservationService.confirmReservation(reservation.id)

      console.log(`[Button Response] Reservation confirmed: ${reservation.id}`)

      await activityService.logActivity(ActivityType.RESERVATION_CONFIRMED, {
        reservationId: reservation.id,
        userId: reservation.commerceUserId,
        productSku: reservation.productPartNumber,
      })

      // Send TWO SSE events to store associate app

      // Event 1: Customer Approaching (for VipNotification)
      // Simulate distance and ETA (in production, this would come from geofence data)
      const distance = "500"
      const eta = calculateETA(500).toString()

      sseService.sendCustomerApproaching({
        customerId: reservation.commerceUserId,
        customerName: reservation.userName || reservation.phoneNumber,
        phoneNumber: reservation.phoneNumber,
        distance,
        eta,
        shoppingCentre: reservation.shoppingCentre,
      })

      await activityService.logActivity(ActivityType.SSE_EVENT_SENT, {
        event: "customer_approaching",
        userId: reservation.commerceUserId,
        shoppingCentre: reservation.shoppingCentre,
      })

      // Event 2: Item Reserved (for Toast + Items on Hold)
      sseService.sendItemReserved(reservation)

      await activityService.logActivity(ActivityType.SSE_EVENT_SENT, {
        event: "item_reserved",
        reservationId: reservation.id,
        shoppingCentre: reservation.shoppingCentre,
      })

      // Track to CDP
      await cdpService.trackReservationConfirmed(reservation)

      await activityService.logActivity(ActivityType.CDP_EVENT_TRACKED, {
        event: "Item Reserved",
        userId: reservation.commerceUserId,
        reservationId: reservation.id,
      })

      // Send confirmation WhatsApp message after a short delay (2 seconds)
      console.log(`[Button Response] Waiting 2 seconds before sending confirmation...`)
      await delay(2000)

      const confirmationResult = await whatsappService.sendReservationConfirmation({
        phoneNumber: reservation.phoneNumber,
        userName: reservation.userName || reservation.phoneNumber,
        productName: reservation.productName,
        productBrand: reservation.productBrand || undefined,
        storeName: reservation.storeName,
        shoppingCentre: reservation.shoppingCentre,
        reservationId: reservation.id,
      })

      if (confirmationResult.success) {
        await activityService.logActivity(ActivityType.WHATSAPP_SENT, {
          userId: reservation.commerceUserId,
          phoneNumber: reservation.phoneNumber,
          reservationId: reservation.id,
          messageId: confirmationResult.messageId,
          messageType: 'confirmation',
        })

        // Track WhatsApp confirmation message to CDP
        await cdpService.trackWhatsAppSent({
          userId: reservation.commerceUserId,
          phoneNumber: reservation.phoneNumber,
          productName: reservation.productName,
          storeName: reservation.storeName,
          messageId: confirmationResult.messageId,
        })

        await activityService.logActivity(ActivityType.CDP_EVENT_TRACKED, {
          event: "WhatsApp Message Sent",
          userId: reservation.commerceUserId,
          messageId: confirmationResult.messageId,
          messageType: 'confirmation',
        })

        console.log(`[Button Response] Confirmation message sent: ${confirmationResult.messageId}`)
      } else {
        console.warn(`[Button Response] Failed to send confirmation: ${confirmationResult.error}`)
      }

      return NextResponse.json({
        success: true,
        message: "Reservation confirmed",
        reservation: {
          id: reservation.id,
          status: reservation.status,
        },
      })
    }

    if (data.buttonId === "no_thanks" || data.payload?.action === "decline") {
      // USER DECLINED OFFER - Just log the decline, no reservation to update
      console.log(`[Button Response] User declined offer for message ${data.messageId}`)

      await activityService.logActivity(ActivityType.RESERVATION_DECLINED, {
        messageId: data.messageId,
        userId: offer.userId,
        productSku: offer.productPartNumber,
        phoneNumber: offer.phoneNumber,
        reason: 'User clicked "Not Interested"',
      })

      // Track to CDP (if needed, create a minimal reservation-like object for tracking)
      await cdpService.trackOfferDeclined({
        commerceUserId: offer.userId,
        phoneNumber: offer.phoneNumber,
        productPartNumber: offer.productPartNumber,
        productName: offer.productName,
        storeName: offer.storeName,
        shoppingCentre: offer.shoppingCentre,
      })

      await activityService.logActivity(ActivityType.CDP_EVENT_TRACKED, {
        event: "Offer Declined",
        userId: offer.userId,
        messageId: data.messageId,
      })

      return NextResponse.json({
        success: true,
        message: "Offer declined",
      })
    }

    // Unknown button action
    console.warn(`[Button Response] Unknown button action: ${data.buttonId}`)
    return NextResponse.json({
      success: true,
      message: "Button click recorded (no action taken)",
    })
  } catch (error) {
    console.error("[Button Response] Error:", error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
