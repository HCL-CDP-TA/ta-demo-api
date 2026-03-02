import { NextRequest } from 'next/server'
import { sseService } from '@/lib/services/sse.service'
import type { SSEClientFilters } from '@/lib/types/sse.types'

export const dynamic = 'force-dynamic'

// CORS headers for cross-origin SSE connections
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

/**
 * SSE Stream for Store Associate App
 *
 * Provides real-time updates for:
 * - customer_approaching: VIP customer entering geofence
 * - item_reserved: Customer reserved an item
 * - reservation_declined: Customer declined reservation
 *
 * Query Parameters:
 * - storeId: Filter events for specific store (optional)
 * - shoppingCentre: Filter events for specific shopping centre (optional)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId') || undefined
  const shoppingCentre = searchParams.get('shoppingCentre') || undefined

  const filters: SSEClientFilters = {
    storeId,
    shoppingCentre
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const clientId = crypto.randomUUID()

      // Register client with SSE service
      sseService.addClient(clientId, controller, filters)

      // Send initial connection message
      const initialMessage = `data: ${JSON.stringify({
        type: 'connected',
        message: 'SSE connection established',
        clientId,
        filters
      })}\n\n`
      controller.enqueue(new TextEncoder().encode(initialMessage))

      // Keep-alive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(':keep-alive\n\n'))
        } catch (error) {
          // Client disconnected, cleanup
          clearInterval(keepAliveInterval)
          sseService.removeClient(clientId)
        }
      }, 30000)

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval)
        sseService.removeClient(clientId)
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      ...corsHeaders,
    }
  })
}
