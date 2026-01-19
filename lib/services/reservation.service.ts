import { prisma } from '../db'
import { ReservationStatus } from '@prisma/client'
import { calculateCOBToday } from '../utils/date.helpers'

export interface CreateReservationParams {
  // User data (from HCL Commerce API)
  commerceUserId: string
  phoneNumber: string
  userName?: string

  // Product data (from HCL Commerce API)
  productPartNumber: string
  productName: string
  productBrand?: string
  productPrice?: number
  productImageUrl?: string

  // Location data
  shoppingCentre: string
  storeName: string
  locationId: string

  // Optional
  messageId?: string
  geofenceEventData?: unknown
}

export interface QueryReservationsParams {
  shoppingCentre?: string
  storeName?: string
  locationId?: string
  status?: ReservationStatus[]
  limit?: number
  offset?: number
}

export class ReservationService {
  /**
   * Creates a new reservation with inline user/product data
   */
  async createReservation(params: CreateReservationParams) {
    const expiresAt = calculateCOBToday()

    const reservation = await prisma.reservation.create({
      data: {
        commerceUserId: params.commerceUserId,
        phoneNumber: params.phoneNumber,
        userName: params.userName,
        productPartNumber: params.productPartNumber,
        productName: params.productName,
        productBrand: params.productBrand,
        productPrice: params.productPrice,
        productImageUrl: params.productImageUrl,
        shoppingCentre: params.shoppingCentre,
        storeName: params.storeName,
        locationId: params.locationId,
        messageId: params.messageId,
        geofenceEventData: params.geofenceEventData as any,
        expiresAt,
        status: ReservationStatus.PENDING
      }
    })

    console.log(`[ReservationService] Created reservation ${reservation.id} for user ${params.commerceUserId}`)

    return reservation
  }

  /**
   * Confirms a reservation (user clicked "Reserve Item")
   */
  async confirmReservation(reservationId: string) {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.CONFIRMED,
        confirmedAt: new Date()
      }
    })

    console.log(`[ReservationService] Confirmed reservation ${reservationId}`)

    return reservation
  }

  /**
   * Declines a reservation (user clicked "No Thanks")
   */
  async declineReservation(reservationId: string) {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.DECLINED,
        cancelledAt: new Date()
      }
    })

    console.log(`[ReservationService] Declined reservation ${reservationId}`)

    return reservation
  }

  /**
   * Cancels a reservation (staff action)
   */
  async cancelReservation(reservationId: string) {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: new Date()
      }
    })

    console.log(`[ReservationService] Cancelled reservation ${reservationId}`)

    return reservation
  }

  /**
   * Marks a reservation as completed (customer picked up item)
   */
  async completeReservation(reservationId: string) {
    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.COMPLETED,
        completedAt: new Date()
      }
    })

    console.log(`[ReservationService] Completed reservation ${reservationId}`)

    return reservation
  }

  /**
   * Finds a reservation by message ID
   */
  async findByMessageId(messageId: string) {
    const reservation = await prisma.reservation.findFirst({
      where: { messageId }
    })

    return reservation
  }

  /**
   * Finds a reservation by ID
   */
  async findById(id: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id }
    })

    return reservation
  }

  /**
   * Queries reservations with filters
   */
  async queryReservations(params: QueryReservationsParams) {
    const where: any = {}

    if (params.shoppingCentre) {
      where.shoppingCentre = params.shoppingCentre
    }

    if (params.storeName) {
      where.storeName = params.storeName
    }

    if (params.locationId) {
      where.locationId = params.locationId
    }

    if (params.status && params.status.length > 0) {
      where.status = { in: params.status }
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0
      }),
      prisma.reservation.count({ where })
    ])

    return { reservations, total }
  }

  /**
   * Expires old reservations (can be run as a cron job)
   */
  async expireOldReservations() {
    const now = new Date()

    const result = await prisma.reservation.updateMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: {
          lt: now
        }
      },
      data: {
        status: ReservationStatus.EXPIRED
      }
    })

    if (result.count > 0) {
      console.log(`[ReservationService] Expired ${result.count} old reservation(s)`)
    }

    return result.count
  }

  /**
   * Gets reservation statistics
   */
  async getStats() {
    const [
      total,
      pending,
      confirmed,
      declined,
      expired,
      cancelled,
      completed
    ] = await Promise.all([
      prisma.reservation.count(),
      prisma.reservation.count({ where: { status: ReservationStatus.PENDING } }),
      prisma.reservation.count({ where: { status: ReservationStatus.CONFIRMED } }),
      prisma.reservation.count({ where: { status: ReservationStatus.DECLINED } }),
      prisma.reservation.count({ where: { status: ReservationStatus.EXPIRED } }),
      prisma.reservation.count({ where: { status: ReservationStatus.CANCELLED } }),
      prisma.reservation.count({ where: { status: ReservationStatus.COMPLETED } })
    ])

    return {
      total,
      pending,
      confirmed,
      declined,
      expired,
      cancelled,
      completed
    }
  }
}

// Export singleton instance
export const reservationService = new ReservationService()
