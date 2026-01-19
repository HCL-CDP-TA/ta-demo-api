import { NextRequest, NextResponse } from 'next/server'
import { reservationService } from '@/lib/services/reservation.service'
import { ReservationStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Query Reservations for Store Associate App
 *
 * Returns reservations filtered by shopping centre, store, and status.
 * Supports pagination for large result sets.
 *
 * Query Parameters:
 * - shoppingCentre: Filter by shopping centre name (optional)
 * - storeName: Filter by store name (optional)
 * - status: Comma-separated list of statuses (optional, e.g., "PENDING,CONFIRMED")
 * - limit: Number of results per page (default: 50, max: 100)
 * - offset: Number of results to skip (default: 0)
 *
 * Example: /api/store-associate/reservations?shoppingCentre=Westfield Mall&storeName=Zara&status=PENDING,CONFIRMED&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const shoppingCentre = searchParams.get('shoppingCentre') || undefined
    const storeName = searchParams.get('storeName') || undefined
    const statusParam = searchParams.get('status')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    // Parse status filter
    let status: ReservationStatus[] | undefined
    if (statusParam) {
      const validStatuses = Object.values(ReservationStatus)
      status = statusParam
        .split(',')
        .map(s => s.trim().toUpperCase() as ReservationStatus)
        .filter(s => validStatuses.includes(s))
    }

    // Parse pagination
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0

    // Query reservations
    const result = await reservationService.queryReservations({
      shoppingCentre,
      storeName,
      status,
      limit,
      offset
    })

    // Format response
    const response = {
      success: true,
      data: {
        reservations: result.reservations,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total
        },
        filters: {
          shoppingCentre,
          storeName,
          status
        }
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Store Associate Reservations API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to query reservations',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
