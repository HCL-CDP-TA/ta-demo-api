import { NextResponse } from 'next/server'
import { activityService } from '@/lib/services/activity.service'

export const dynamic = 'force-dynamic'

/**
 * Dashboard Statistics Endpoint
 *
 * Returns comprehensive statistics for the dashboard including:
 * - Geofence entries (today vs total)
 * - WhatsApp messages sent (today vs total)
 * - Reservation status breakdown (pending, confirmed, declined, expired)
 * - Active SSE connections
 * - CDP events tracked (today vs total)
 *
 * This endpoint is optimized for dashboard widgets and real-time monitoring.
 */
export async function GET() {
  try {
    const stats = await activityService.getStats()

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Dashboard Stats API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
