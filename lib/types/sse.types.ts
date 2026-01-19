// Server-Sent Events Types

export type SSEEventType =
  | 'customer_approaching'
  | 'item_reserved'
  | 'heartbeat'

export interface CustomerApproachingEvent {
  id: string
  heading: string
  message: string
  customerName: string
  customerId: string
  phoneNumber: string
  distance: string
  eta: string
}

export interface ItemReservedEvent {
  reservationId: string
  customerName: string
  productName: string
  productSku: string
  price: number
  imageUrl?: string
  storeName: string
  expiresAt: string
}

export interface HeartbeatEvent {
  timestamp: string
}

export type SSEEventData =
  | CustomerApproachingEvent
  | ItemReservedEvent
  | HeartbeatEvent

export interface SSEEvent {
  event: SSEEventType
  data: SSEEventData
}

export interface SSEClientFilters {
  storeId?: string
  shoppingCentre?: string
}

export interface SSEClient {
  id: string
  controller: ReadableStreamDefaultController
  storeId?: string
  shoppingCentre?: string
}
