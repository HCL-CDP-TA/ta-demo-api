import { prisma } from '../db'
import { ActivityType } from '@prisma/client'
import { getStartOfToday } from '../utils/date.helpers'
import { sseService } from './sse.service'

export class ActivityService {
  /**
   * Logs an activity event
   */
  async logActivity(type: ActivityType, data: unknown): Promise<void> {
    try {
      await prisma.activity.create({
        data: {
          type,
          data: data as any,
          timestamp: new Date()
        }
      })

      console.log(`[ActivityService] Logged ${type} activity`)
    } catch (error) {
      console.error('[ActivityService] Failed to log activity:', error)
      // Don't throw - activity logging failures shouldn't block the main flow
    }
  }

  /**
   * Gets recent activity logs
   */
  async getRecentActivity(limit: number = 50, offset: number = 0) {
    const activities = await prisma.activity.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset
    })

    return activities
  }

  /**
   * Gets activity logs by type
   */
  async getActivitiesByType(type: ActivityType, limit: number = 50) {
    const activities = await prisma.activity.findMany({
      where: { type },
      orderBy: { timestamp: 'desc' },
      take: limit
    })

    return activities
  }

  /**
   * Finds a specific activity by type and messageId
   */
  async findByTypeAndMessageId(type: ActivityType, messageId: string) {
    const activity = await prisma.activity.findFirst({
      where: {
        type,
        data: {
          path: ['messageId'],
          equals: messageId
        }
      },
      orderBy: { timestamp: 'desc' }
    })

    return activity
  }

  /**
   * Gets activity count for today
   */
  async getTodayActivityCount(type?: ActivityType) {
    const startOfToday = getStartOfToday()

    const count = await prisma.activity.count({
      where: {
        ...(type && { type }),
        timestamp: {
          gte: startOfToday
        }
      }
    })

    return count
  }

  /**
   * Gets comprehensive dashboard statistics
   */
  async getStats() {
    const startOfToday = getStartOfToday()

    const [
      geofenceEntriesToday,
      geofenceEntriesTotal,
      whatsappMessagesToday,
      whatsappMessagesTotal,
      reservationStats,
      cdpEventsToday,
      cdpEventsTotal
    ] = await Promise.all([
      // Geofence entries today
      prisma.activity.count({
        where: {
          type: ActivityType.GEOFENCE_ENTRY,
          timestamp: { gte: startOfToday }
        }
      }),
      // Geofence entries total
      prisma.activity.count({
        where: { type: ActivityType.GEOFENCE_ENTRY }
      }),
      // WhatsApp messages today
      prisma.activity.count({
        where: {
          type: ActivityType.WHATSAPP_SENT,
          timestamp: { gte: startOfToday }
        }
      }),
      // WhatsApp messages total
      prisma.activity.count({
        where: { type: ActivityType.WHATSAPP_SENT }
      }),
      // Reservation stats
      this.getReservationStats(),
      // CDP events today
      prisma.activity.count({
        where: {
          type: ActivityType.CDP_EVENT_TRACKED,
          timestamp: { gte: startOfToday }
        }
      }),
      // CDP events total
      prisma.activity.count({
        where: { type: ActivityType.CDP_EVENT_TRACKED }
      })
    ])

    return {
      geofenceEntries: {
        today: geofenceEntriesToday,
        total: geofenceEntriesTotal
      },
      whatsappMessages: {
        today: whatsappMessagesToday,
        total: whatsappMessagesTotal
      },
      reservations: reservationStats,
      sseConnections: {
        active: sseService.getConnectionCount()
      },
      cdpEvents: {
        today: cdpEventsToday,
        total: cdpEventsTotal
      }
    }
  }

  /**
   * Gets reservation statistics
   */
  private async getReservationStats() {
    const [pending, confirmed, declined, expired, total] = await Promise.all([
      prisma.reservation.count({ where: { status: 'PENDING' } }),
      prisma.reservation.count({ where: { status: 'CONFIRMED' } }),
      prisma.reservation.count({ where: { status: 'DECLINED' } }),
      prisma.reservation.count({ where: { status: 'EXPIRED' } }),
      prisma.reservation.count()
    ])

    return {
      pending,
      confirmed,
      declined,
      expired,
      total
    }
  }

  /**
   * Deletes old activity logs (cleanup task)
   */
  async deleteOldActivities(daysToKeep: number = 30) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const result = await prisma.activity.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    })

    console.log(`[ActivityService] Deleted ${result.count} old activity log(s)`)

    return result.count
  }
}

// Export singleton instance
export const activityService = new ActivityService()
