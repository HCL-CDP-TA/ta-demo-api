/**
 * Calculates the Close of Business (COB) time for today.
 * If COB has already passed, returns tomorrow's COB time.
 *
 * @returns Date object representing COB time
 */
export function calculateCOBToday(): Date {
  const now = new Date()
  const cobTime = process.env.COB_TIME || '17:00'
  const [hours, minutes] = cobTime.split(':').map(Number)

  const cob = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
    0
  )

  // If COB has passed today, return tomorrow's COB
  if (cob < now) {
    cob.setDate(cob.getDate() + 1)
  }

  return cob
}

/**
 * Calculates estimated time of arrival in minutes based on distance.
 * Assumes walking speed of 3 mph (264 ft/min)
 *
 * @param distanceInFeet - Distance in feet
 * @returns ETA in minutes
 */
export function calculateETA(distanceInFeet: number): number {
  // Walking speed: 3 mph = 264 ft/min
  const walkingSpeedFtPerMin = 264
  const etaMinutes = Math.ceil(distanceInFeet / walkingSpeedFtPerMin)
  return Math.max(1, etaMinutes) // Minimum 1 minute
}

/**
 * Formats a date as ISO string for consistency
 *
 * @param date - Date to format
 * @returns ISO 8601 formatted string
 */
export function formatISOString(date: Date): string {
  return date.toISOString()
}

/**
 * Gets the start of today (midnight)
 *
 * @returns Date object representing start of today
 */
export function getStartOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

/**
 * Gets the end of today (23:59:59.999)
 *
 * @returns Date object representing end of today
 */
export function getEndOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
}
