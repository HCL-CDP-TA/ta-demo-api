import { WhatsAppMessage, WhatsAppButton, WhatsAppApiResponse } from "../types/whatsapp.types"

export interface SendReservationMessageParams {
  phoneNumber: string
  userName: string
  productName: string
  productBrand?: string
  productPartNumber: string
  productPrice?: string
  productImageUrl?: string
  storeName: string
  shoppingCentre: string
  locationId: string
  userId: string
  geofenceEventData?: Record<string, unknown>
  reservationId?: string | null // Optional since we may send offers before creating reservations
}

export class WhatsAppService {
  private phoneEmulatorUrl: string
  private enabled: boolean

  constructor() {
    this.phoneEmulatorUrl = process.env.PHONE_EMULATOR_URL || "http://localhost:3000"
    this.enabled = process.env.ENABLE_WHATSAPP === "true"
  }

  /**
   * Sends a reservation message to a user via WhatsApp
   */
  async sendReservationMessage(
    params: SendReservationMessageParams,
  ): Promise<{ success: boolean; messageId?: string; offerId?: string; error?: string }> {
    if (!this.enabled) {
      console.warn("[WhatsAppService] WhatsApp is disabled, skipping message")
      return { success: false, error: "WhatsApp is disabled" }
    }

    const productDisplay = params.productBrand ? `${params.productBrand} ${params.productName}` : params.productName

    const message = `Hi ${params.userName}, ${productDisplay} is in stock at ${params.storeName} in ${params.shoppingCentre}. Would you like to reserve it until COB today?`

    const apiBaseUrl = process.env.API_BASE_URL || process.env.TA_DEMO_API_URL || "http://localhost:3001"

    // Create an offer record in the database
    const { offerService } = await import("./offer.service")
    const offer = await offerService.createOffer({
      userId: params.userId,
      phoneNumber: params.phoneNumber,
      userName: params.userName,
      productPartNumber: params.productPartNumber,
      productName: params.productName,
      productBrand: params.productBrand,
      productPrice: params.productPrice,
      productImageUrl: params.productImageUrl,
      storeName: params.storeName,
      shoppingCentre: params.shoppingCentre,
      locationId: params.locationId,
      geofenceEventData: params.geofenceEventData,
    })

    // Include offer ID in button URL as query parameter
    const buttons: WhatsAppButton[] = [
      {
        id: "reserve_item",
        text: "Reserve Item",
        type: "quick_reply",
        url: `${apiBaseUrl}/api/whatsapp/button-response?offerId=${offer.id}`,
      },
      {
        id: "no_thanks",
        text: "No Thanks",
        type: "quick_reply",
        url: `${apiBaseUrl}/api/whatsapp/button-response?offerId=${offer.id}`,
      },
    ]

    const whatsappMessage: WhatsAppMessage = {
      phoneNumber: params.phoneNumber,
      sender: params.storeName,
      senderNumber: "+1-800-SHOP",
      message,
      profilePictureUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(params.storeName)}&background=random`,
      buttons,
    }

    try {
      console.log(`[WhatsAppService] Sending message to ${params.phoneNumber}`)

      const response = await fetch(`${this.phoneEmulatorUrl}/api/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whatsappMessage),
      })

      const data: WhatsAppApiResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `WhatsApp API failed with status ${response.status}`)
      }

      // Extract messageId - the phone emulator returns it at the top level
      const messageId = data.messageId || data.data?.messageId || data.data?.timestamp || new Date().toISOString()

      console.log(`[WhatsAppService] Message sent successfully, messageId: ${messageId}, offerId: ${offer.id}`)

      return {
        success: true,
        messageId,
        offerId: offer.id,
      }
    } catch (error) {
      console.error("[WhatsAppService] Failed to send message:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Sends a reservation confirmation message to a user via WhatsApp
   */
  async sendReservationConfirmation(params: {
    phoneNumber: string
    userName: string
    productName: string
    productBrand?: string
    storeName: string
    shoppingCentre: string
    reservationId: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.enabled) {
      console.warn("[WhatsAppService] WhatsApp is disabled, skipping message")
      return { success: false, error: "WhatsApp is disabled" }
    }

    const productDisplay = params.productBrand ? `${params.productBrand} ${params.productName}` : params.productName

    const message = `Great news ${params.userName}! Your reservation for ${productDisplay} at ${
      params.storeName
    } has been confirmed. Please pick it up before close of business today. Reservation #${params.reservationId.slice(
      0,
      8,
    )}`

    const whatsappMessage: WhatsAppMessage = {
      phoneNumber: params.phoneNumber,
      sender: params.storeName,
      senderNumber: "+1-800-SHOP",
      message,
      profilePictureUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(params.storeName)}&background=random`,
    }

    try {
      console.log(`[WhatsAppService] Sending confirmation to ${params.phoneNumber}`)

      const response = await fetch(`${this.phoneEmulatorUrl}/api/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whatsappMessage),
      })

      const data: WhatsAppApiResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `WhatsApp API failed with status ${response.status}`)
      }

      const messageId = data.messageId || data.data?.messageId || data.data?.timestamp || new Date().toISOString()

      console.log(`[WhatsAppService] Confirmation sent successfully, messageId: ${messageId}`)

      return {
        success: true,
        messageId,
      }
    } catch (error) {
      console.error("[WhatsAppService] Failed to send confirmation:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Sends a generic WhatsApp message
   */
  async sendMessage(message: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.enabled) {
      console.warn("[WhatsAppService] WhatsApp is disabled, skipping message")
      return { success: false, error: "WhatsApp is disabled" }
    }

    try {
      const response = await fetch(`${this.phoneEmulatorUrl}/api/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      })

      const data: WhatsAppApiResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `WhatsApp API failed with status ${response.status}`)
      }

      // Extract messageId - the phone emulator returns it at the top level
      const messageId = data.messageId || data.data?.messageId || data.data?.timestamp || new Date().toISOString()

      return {
        success: true,
        messageId,
      }
    } catch (error) {
      console.error("[WhatsAppService] Failed to send message:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService()
