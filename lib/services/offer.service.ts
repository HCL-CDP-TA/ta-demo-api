import { prisma } from '../db'

export interface CreateOfferParams {
  userId: string
  phoneNumber: string
  userName?: string
  productPartNumber: string
  productName: string
  productBrand?: string
  productPrice?: string
  productImageUrl?: string
  storeName: string
  shoppingCentre: string
  locationId: string
  geofenceEventData?: Record<string, unknown>
}

export class OfferService {
  /**
   * Creates a new offer that expires in 1 hour
   */
  async createOffer(params: CreateOfferParams) {
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1) // Expire after 1 hour

    const offer = await prisma.offer.create({
      data: {
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
        geofenceEventData: params.geofenceEventData as any,
        expiresAt,
      }
    })

    console.log(`[OfferService] Created offer ${offer.id} (expires at ${expiresAt.toISOString()})`)

    return offer
  }

  /**
   * Gets an offer by ID
   */
  async getOfferById(offerId: string) {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId }
    })

    // Check if offer has expired
    if (offer && offer.expiresAt < new Date()) {
      console.log(`[OfferService] Offer ${offerId} has expired`)
      return null
    }

    return offer
  }

  /**
   * Deletes expired offers (cleanup task)
   */
  async deleteExpiredOffers() {
    const result = await prisma.offer.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    })

    console.log(`[OfferService] Deleted ${result.count} expired offer(s)`)

    return result.count
  }
}

// Export singleton instance
export const offerService = new OfferService()
