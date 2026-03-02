import { NextRequest, NextResponse } from 'next/server'
import { sseService } from '@/lib/services/sse.service'

/**
 * Test endpoint to manually trigger SSE events
 * POST /api/test/sse-event
 *
 * Body:
 * {
 *   "type": "customer_approaching" | "item_reserved",
 *   "data": { ... event data ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type } = body

    if (type === 'customer_approaching') {
      // Send to ALL clients by not specifying filters
      const event = {
        event: 'customer_approaching',
        data: {
          id: crypto.randomUUID(),
          heading: 'VIP CUSTOMER APPROACHING',
          message: 'High-value customer detected within 500ft radius.',
          customerName: 'Jane Smith',
          customerId: 'test-user-001',
          phoneNumber: '+1234567890',
          distance: '500',
          eta: '2'
        }
      }

      // Broadcast without filters to reach all clients
      const clientCount = sseService.getConnectionCount()
      console.log(`[TEST] About to broadcast to ${clientCount} clients`)
      sseService.broadcast(event)
      console.log(`[TEST] Broadcast complete`)

      return NextResponse.json({
        success: true,
        message: 'customer_approaching event sent',
        clientsBeforeBroadcast: clientCount,
      })
    }

    if (type === 'item_reserved') {
      // Create a mock Reservation object matching Prisma schema
      const mockReservation = {
        id: 'test-reservation-123',
        userName: 'Jane Smith',
        phoneNumber: '+1234567890',
        productName: 'Designer Handbag',
        productPartNumber: 'HB-001',
        productPrice: 299.99,
        productImageUrl: 'https://example.com/handbag.jpg',
        storeName: 'Ruby Store',
        shoppingCentre: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
      sseService.sendItemReserved(mockReservation as any)

      return NextResponse.json({
        success: true,
        message: 'item_reserved event sent',
      })
    }

    return NextResponse.json(
      { error: 'Invalid event type. Use "customer_approaching" or "item_reserved"' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error sending test SSE event:', error)
    return NextResponse.json(
      { error: 'Failed to send event' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to send test SSE events',
    connectedClients: sseService.getConnectionCount(),
    examples: [
      { type: 'customer_approaching' },
      { type: 'item_reserved' },
    ],
  })
}
