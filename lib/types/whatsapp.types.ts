// WhatsApp Message Types

export type WhatsAppButtonType = 'quick_reply' | 'url' | 'phone' | 'custom'

export interface WhatsAppButton {
  id: string
  text: string
  type: WhatsAppButtonType
  url?: string
}

export interface WhatsAppMessage {
  phoneNumber: string
  sender: string
  senderNumber?: string
  message: string
  profilePictureUrl?: string
  buttons?: WhatsAppButton[]
}

export interface WhatsAppButtonClick {
  messageId: string
  buttonId: string
  buttonText: string
  sender: string
  senderNumber?: string
  payload?: {
    reservationId?: string
    [key: string]: unknown
  }
}

export interface WhatsAppApiResponse {
  success: boolean
  error?: string
  messageId?: string // Phone emulator returns messageId at top level
  data?: {
    messageId?: string
    timestamp?: string
  }
}
