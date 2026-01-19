// CDP Event Types

export interface CDPEventPayload {
  type: 'track'
  eventname: string
  userid: string
  properties: Record<string, unknown>
  context: {
    library: {
      name: string
      version: string
    }
  }
}

export interface CDPApiConfig {
  endpoint: string
  apiKey: string
  passKey: string
}

export interface CDPResponse {
  id?: string
  success?: boolean
  error?: string
}
