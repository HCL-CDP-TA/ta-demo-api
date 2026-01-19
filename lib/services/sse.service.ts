import {
  SSEClient,
  SSEClientFilters,
  SSEEvent,
  CustomerApproachingEvent,
  ItemReservedEvent
} from '../types/sse.types'
import { Reservation } from '@prisma/client'

export class SSEService {
  private clients: Map<string, SSEClient> = new Map()
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startHeartbeat()
  }

  /**
   * Starts the heartbeat interval to keep connections alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(() => {
      const event: SSEEvent = {
        event: 'heartbeat',
        data: {
          timestamp: new Date().toISOString()
        }
      }
      this.broadcast(event)
    }, 30000) // 30 seconds
  }

  /**
   * Adds a new SSE client
   */
  addClient(id: string, controller: ReadableStreamDefaultController, filters?: SSEClientFilters): void {
    this.clients.set(id, {
      id,
      controller,
      storeId: filters?.storeId,
      shoppingCentre: filters?.shoppingCentre
    })

    console.log(`[SSEService] Client connected: ${id} (total: ${this.clients.size})`)

    // Send initial connection confirmation
    const welcomeEvent: SSEEvent = {
      event: 'heartbeat',
      data: {
        timestamp: new Date().toISOString()
      }
    }
    this.sendToClient(id, welcomeEvent)
  }

  /**
   * Removes an SSE client
   */
  removeClient(id: string): void {
    const removed = this.clients.delete(id)
    if (removed) {
      console.log(`[SSEService] Client disconnected: ${id} (total: ${this.clients.size})`)
    }
  }

  /**
   * Sends an event to a specific client
   */
  private sendToClient(clientId: string, event: SSEEvent): void {
    const client = this.clients.get(clientId)
    if (!client) return

    try {
      const message = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
      const encoder = new TextEncoder()
      client.controller.enqueue(encoder.encode(message))
    } catch (error) {
      console.error(`[SSEService] Failed to send to client ${clientId}:`, error)
      this.removeClient(clientId)
    }
  }

  /**
   * Broadcasts an event to all clients matching the filters
   */
  broadcast(event: SSEEvent, filters?: SSEClientFilters): void {
    const message = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
    const encoder = new TextEncoder()

    let sentCount = 0

    for (const client of this.clients.values()) {
      // Apply filters
      if (filters?.storeId && client.storeId !== filters.storeId) continue
      if (filters?.shoppingCentre && client.shoppingCentre !== filters.shoppingCentre) continue

      try {
        client.controller.enqueue(encoder.encode(message))
        sentCount++
      } catch (error) {
        console.error(`[SSEService] Failed to send to client ${client.id}:`, error)
        this.removeClient(client.id)
      }
    }

    if (sentCount > 0) {
      console.log(`[SSEService] Broadcast ${event.event} to ${sentCount} client(s)`)
    }
  }

  /**
   * Sends a customer approaching notification
   */
  sendCustomerApproaching(params: {
    customerId: string
    customerName: string
    phoneNumber: string
    distance: string
    eta: string
    storeId?: string
    shoppingCentre?: string
  }): void {
    const data: CustomerApproachingEvent = {
      id: crypto.randomUUID(),
      heading: 'VIP CUSTOMER APPROACHING',
      message: `High-value customer detected within ${params.distance}ft radius.`,
      customerName: params.customerName,
      customerId: params.customerId,
      phoneNumber: params.phoneNumber,
      distance: params.distance,
      eta: params.eta
    }

    const event: SSEEvent = {
      event: 'customer_approaching',
      data
    }

    this.broadcast(event, {
      storeId: params.storeId,
      shoppingCentre: params.shoppingCentre
    })
  }

  /**
   * Sends an item reserved notification
   * Uses inline reservation data (user/product data stored on reservation)
   */
  sendItemReserved(reservation: Reservation): void {
    const data: ItemReservedEvent = {
      reservationId: reservation.id,
      customerName: reservation.userName || reservation.phoneNumber,
      productName: reservation.productName,
      productSku: reservation.productPartNumber,
      price: reservation.productPrice ? Number(reservation.productPrice) : 0,
      imageUrl: reservation.productImageUrl || undefined,
      storeName: reservation.storeName,
      expiresAt: reservation.expiresAt.toISOString()
    }

    const event: SSEEvent = {
      event: 'item_reserved',
      data
    }

    this.broadcast(event, {
      shoppingCentre: reservation.shoppingCentre
    })
  }

  /**
   * Gets the current count of active connections
   */
  getConnectionCount(): number {
    return this.clients.size
  }

  /**
   * Gets the count of active connections by filter
   */
  getFilteredConnectionCount(filters?: SSEClientFilters): number {
    let count = 0

    for (const client of this.clients.values()) {
      if (filters?.storeId && client.storeId !== filters.storeId) continue
      if (filters?.shoppingCentre && client.shoppingCentre !== filters.shoppingCentre) continue
      count++
    }

    return count
  }

  /**
   * Cleanup on service shutdown
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    this.clients.clear()
  }
}

// Export singleton instance
export const sseService = new SSEService()
