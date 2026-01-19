import { CDPEventPayload, CDPResponse } from '../types/cdp.types'
import { Reservation } from '@prisma/client'

export class CDPService {
  private endpoint: string
  private apiKey: string
  private passKey: string
  private enabled: boolean

  constructor() {
    this.endpoint = process.env.CDP_ENDPOINT || 'https://crux.dev.hxcd.now.hclsoftware.cloud'
    this.apiKey = process.env.CDP_API_KEY || ''
    this.passKey = process.env.CDP_PASS_KEY || ''
    this.enabled = process.env.ENABLE_CDP_TRACKING === 'true'
  }

  /**
   * Tracks a generic event to CDP
   */
  async trackEvent(
    eventName: string,
    userId: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled) {
      console.warn('[CDPService] CDP tracking is disabled, skipping event')
      return
    }

    if (!this.apiKey || !this.passKey) {
      console.warn('[CDPService] CDP not configured (missing API keys), skipping event')
      return
    }

    const payload: CDPEventPayload = {
      type: 'track',
      eventname: eventName,
      userid: userId,
      properties,
      context: {
        library: {
          name: 'ta-demo-api',
          version: '1.0.0'
        }
      }
    }

    try {
      console.log(`[CDPService] Tracking event "${eventName}" for user ${userId}`)

      const response = await fetch(`${this.endpoint}/v3/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'x-api-passkey': this.passKey
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`CDP API failed: ${response.status} ${response.statusText}`)
      }

      const result: CDPResponse = await response.json()
      console.log(`[CDPService] Event tracked successfully (id: ${result.id})`)
    } catch (error) {
      console.error('[CDPService] Failed to track event:', error)
      // Don't throw - CDP failures shouldn't block the flow
    }
  }

  /**
   * Tracks a reservation confirmed event
   * Uses inline reservation data (user/product data stored on reservation)
   */
  async trackReservationConfirmed(reservation: Reservation): Promise<void> {
    await this.trackEvent('Item Reserved', reservation.commerceUserId, {
      reservation_id: reservation.id,
      product_sku: reservation.productPartNumber,
      product_name: reservation.productName,
      product_brand: reservation.productBrand || '',
      product_price: reservation.productPrice?.toString() || '0',
      shopping_centre: reservation.shoppingCentre,
      store_name: reservation.storeName,
      location_id: reservation.locationId,
      phone_number: reservation.phoneNumber,
      expires_at: reservation.expiresAt.toISOString(),
      confirmed_at: reservation.confirmedAt?.toISOString() || new Date().toISOString()
    })
  }

  /**
   * Tracks a reservation declined event
   * Uses inline reservation data (user/product data stored on reservation)
   */
  async trackReservationDeclined(reservation: Reservation): Promise<void> {
    await this.trackEvent('Reservation Declined', reservation.commerceUserId, {
      reservation_id: reservation.id,
      product_sku: reservation.productPartNumber,
      product_name: reservation.productName,
      shopping_centre: reservation.shoppingCentre,
      store_name: reservation.storeName,
      location_id: reservation.locationId,
      phone_number: reservation.phoneNumber,
      reason: 'user_declined',
      declined_at: reservation.cancelledAt?.toISOString() || new Date().toISOString()
    })
  }

  /**
   * Tracks a geofence entry event
   */
  async trackGeofenceEntry(params: {
    userId: string
    geofenceId: string
    geofenceName: string
    phoneNumber: string
    latitude: number
    longitude: number
  }): Promise<void> {
    await this.trackEvent('Geofence Entered', params.userId, {
      geofence_id: params.geofenceId,
      geofence_name: params.geofenceName,
      phone_number: params.phoneNumber,
      latitude: params.latitude,
      longitude: params.longitude,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Tracks a WhatsApp message sent event
   */
  async trackWhatsAppSent(params: {
    userId: string
    phoneNumber: string
    productName: string
    storeName: string
    messageId?: string
  }): Promise<void> {
    await this.trackEvent('WhatsApp Message Sent', params.userId, {
      phone_number: params.phoneNumber,
      product_name: params.productName,
      store_name: params.storeName,
      message_id: params.messageId || '',
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Tracks an offer declined event (user declined before reservation was created)
   */
  async trackOfferDeclined(params: {
    commerceUserId: string
    phoneNumber: string
    productPartNumber: string
    productName: string
    storeName: string
    shoppingCentre: string
  }): Promise<void> {
    await this.trackEvent('Offer Declined', params.commerceUserId, {
      product_sku: params.productPartNumber,
      product_name: params.productName,
      shopping_centre: params.shoppingCentre,
      store_name: params.storeName,
      phone_number: params.phoneNumber,
      reason: 'user_clicked_not_interested',
      declined_at: new Date().toISOString()
    })
  }
}

// Export singleton instance
export const cdpService = new CDPService()
