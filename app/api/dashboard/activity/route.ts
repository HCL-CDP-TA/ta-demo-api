import { NextRequest, NextResponse } from 'next/server'
import { activityService } from '@/lib/services/activity.service'
import { ActivityType } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Dashboard Activity Feed Endpoint
 *
 * Returns recent activity logs for the dashboard activity feed.
 * Supports filtering by activity type and pagination.
 *
 * Query Parameters:
 * - type: Filter by activity type (optional, e.g., "GEOFENCE_ENTRY", "WHATSAPP_SENT")
 * - limit: Number of results per page (default: 50, max: 100)
 * - offset: Number of results to skip (default: 0)
 *
 * Example: /api/dashboard/activity?type=RESERVATION_CONFIRMED&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const typeParam = searchParams.get('type')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    // Parse pagination
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0

    // Fetch activities
    let activities
    if (typeParam) {
      // Validate activity type
      const validTypes = Object.values(ActivityType)
      const type = typeParam.toUpperCase() as ActivityType

      if (!validTypes.includes(type)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid activity type',
            validTypes
          },
          { status: 400 }
        )
      }

      activities = await activityService.getActivitiesByType(type, limit)
    } else {
      activities = await activityService.getRecentActivity(limit, offset)
    }

    // Format response
    const response = {
      success: true,
      data: {
        activities,
        pagination: {
          limit,
          offset,
          count: activities.length
        },
        filters: {
          type: typeParam || null
        }
      },
      timestamp: new Date().toISOString()
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Dashboard Activity API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch activity logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
