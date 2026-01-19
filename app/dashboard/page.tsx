'use client'

import { useEffect, useState } from 'react'

interface DashboardStats {
  geofenceEntries: { today: number; total: number }
  whatsappMessages: { today: number; total: number }
  reservations: {
    pending: number
    confirmed: number
    declined: number
    expired: number
    total: number
  }
  sseConnections: { active: number }
  cdpEvents: { today: number; total: number }
}

interface Activity {
  id: string
  type: string
  data: Record<string, unknown>
  timestamp: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats')
      const result = await response.json()

      if (result.success) {
        setStats(result.data)
      } else {
        setError(result.error || 'Failed to fetch stats')
      }
    } catch (err) {
      setError('Network error fetching stats')
      console.error(err)
    }
  }

  // Fetch activities
  const fetchActivities = async () => {
    try {
      const response = await fetch('/api/dashboard/activity?limit=20')
      const result = await response.json()

      if (result.success) {
        setActivities(result.data.activities)
      } else {
        setError(result.error || 'Failed to fetch activities')
      }
    } catch (err) {
      setError('Network error fetching activities')
      console.error(err)
    }
  }

  // Initial fetch
  useEffect(() => {
    Promise.all([fetchStats(), fetchActivities()]).finally(() => {
      setLoading(false)
    })

    // Refresh stats every 10 seconds
    const interval = setInterval(fetchStats, 10000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">TA Demo API Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time monitoring and analytics</p>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Geofence Entries */}
            <StatCard
              title="Geofence Entries"
              today={stats.geofenceEntries.today}
              total={stats.geofenceEntries.total}
              color="blue"
            />

            {/* WhatsApp Messages */}
            <StatCard
              title="WhatsApp Messages"
              today={stats.whatsappMessages.today}
              total={stats.whatsappMessages.total}
              color="green"
            />

            {/* CDP Events */}
            <StatCard
              title="CDP Events"
              today={stats.cdpEvents.today}
              total={stats.cdpEvents.total}
              color="purple"
            />

            {/* Reservations - Pending */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Pending Reservations</h3>
              <p className="text-3xl font-bold text-yellow-600">{stats.reservations.pending}</p>
            </div>

            {/* Reservations - Confirmed */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Confirmed Reservations</h3>
              <p className="text-3xl font-bold text-green-600">{stats.reservations.confirmed}</p>
            </div>

            {/* SSE Connections */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Active SSE Connections</h3>
              <p className="text-3xl font-bold text-indigo-600">{stats.sseConnections.active}</p>
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {activities.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No activity yet
              </div>
            ) : (
              activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  today: number
  total: number
  color: 'blue' | 'green' | 'purple'
}

function StatCard({ title, today, total, color }: StatCardProps) {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600'
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${colorClasses[color]}`}>{today}</p>
        <span className="text-sm text-gray-500">today</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">Total: {total}</p>
    </div>
  )
}

function ActivityItem({ activity }: { activity: Activity }) {
  const formatType = (type: string) => {
    return type.split('_').map(word =>
      word.charAt(0) + word.slice(1).toLowerCase()
    ).join(' ')
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return date.toLocaleDateString()
  }

  const getActivityColor = (type: string) => {
    if (type.includes('GEOFENCE')) return 'bg-blue-100 text-blue-800'
    if (type.includes('WHATSAPP')) return 'bg-green-100 text-green-800'
    if (type.includes('RESERVATION_CONFIRMED')) return 'bg-green-100 text-green-800'
    if (type.includes('RESERVATION_DECLINED')) return 'bg-red-100 text-red-800'
    if (type.includes('CDP')) return 'bg-purple-100 text-purple-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-1 rounded text-xs font-medium ${getActivityColor(activity.type)}`}>
              {formatType(activity.type)}
            </span>
            <span className="text-sm text-gray-500">
              {formatTimestamp(activity.timestamp)}
            </span>
          </div>
          <pre className="text-sm text-gray-600 mt-2 overflow-x-auto">
            {JSON.stringify(activity.data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
