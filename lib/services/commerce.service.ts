import { createCommerceClient, type CommerceClient } from "hcl-commerce-api-sdk"

// Configure Node.js to accept self-signed certificates for Commerce API
// This is necessary for dev/staging Commerce environments
if (process.env.COMMERCE_HOST_URL && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
  console.warn("[CommerceService] Disabling TLS verification for Commerce API (self-signed certificates)")
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

export interface CommerceUser {
  userId: string
  logonId?: string
  firstName?: string
  lastName?: string
  phone1?: string
  email1?: string
}

export interface CommerceWishlistItem {
  partNumber: string
  productId?: string
  quantityRequested?: string
  name?: string
  manufacturer?: string
  unitPrice?: string
  thumbnail?: string
}

export interface InventoryItem {
  partNumber: string
  availableQuantity: number
  inventoryStatus: string
  inStock: boolean
}

export class CommerceService {
  private client: CommerceClient
  private initialized: boolean = false
  private baseUrl: string
  private transactionContext: string
  private searchContext: string
  private storeId: string

  constructor() {
    this.baseUrl = process.env.COMMERCE_HOST_URL || ""
    this.transactionContext = process.env.COMMERCE_TRANSACTION_CONTEXT || "/wcs/resources"
    this.searchContext = process.env.COMMERCE_SEARCH_CONTEXT || "/search/resources"
    this.storeId = process.env.COMMERCE_STORE_ID || ""

    this.client = createCommerceClient({
      hostUrl: this.baseUrl,
      storeHost: process.env.COMMERCE_STORE_HOST || this.baseUrl,
      transactionContext: this.transactionContext,
      searchContext: this.searchContext,
      storeId: this.storeId,
      catalogId: process.env.COMMERCE_CATALOG_ID || "",
      contractId: process.env.COMMERCE_CONTRACT_ID || "",
      commerceVersion: (process.env.COMMERCE_VERSION as "commerce-plus" | "commerce-9x") || "commerce-plus",
      storeName: process.env.COMMERCE_STORE_NAME || "",
      fulfillmentCenter: process.env.COMMERCE_FULFILLMENT_CENTER || "",
      useProxy: false, // Server-side, no proxy needed
    })
  }

  /**
   * Build a full URL for transaction API calls
   */
  private buildTransactionUrl(path: string): string {
    return `${this.baseUrl}${this.transactionContext}${path}`
  }

  /**
   * Build a full URL for search API calls
   */
  private buildSearchUrl(path: string): string {
    return `${this.baseUrl}${this.searchContext}${path}`
  }

  /**
   * Initialize the service by authenticating with the Commerce API
   * Uses service account credentials if provided
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[CommerceService] Already initialized, skipping authentication")
      return
    }

    const adminUser = process.env.COMMERCE_ADMIN_USER
    const adminPassword = process.env.COMMERCE_ADMIN_PASSWORD
    console.log(
      `[CommerceService] Initialize called - Admin user: ${adminUser ? "SET" : "NOT SET"}, Password: ${
        adminPassword ? "SET" : "NOT SET"
      }`,
    )

    if (adminUser && adminPassword) {
      try {
        console.log("[CommerceService] Authenticating with service account...")

        // Manually authenticate using direct fetch to work around SDK URL building bug
        const loginUrl = this.buildTransactionUrl(`/store/${this.storeId}/loginidentity`)
        console.log("[CommerceService] Login URL:", loginUrl)

        const response = await fetch(loginUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            logonId: adminUser,
            logonPassword: adminPassword,
          }),
          credentials: "include",
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const authData = await response.json()
        console.log("[CommerceService] Authentication successful, userId:", authData.userId)

        // Store tokens for subsequent requests
        if (authData.WCToken) {
          this.client.setTokens({ WCToken: authData.WCToken, WCTrustedToken: authData.WCTrustedToken })
        }

        this.initialized = true
      } catch (error) {
        console.error("[CommerceService] Authentication failed:", error)
        // Fall back to anonymous access instead of throwing
        console.warn("[CommerceService] Falling back to anonymous access")
        this.initialized = true
      }
    } else {
      console.warn("[CommerceService] No service account credentials provided - using anonymous access")
      this.initialized = true
    }
  }

  /**
   * Get user profile by user ID or logonId
   * Returns user data including phone number
   *
   * Supports both:
   * - Numeric user IDs (e.g., "6", "1234")
   * - LogonIds/usernames (e.g., "olivia_prospect")
   */
  async getUserById(userIdOrLogonId: string): Promise<CommerceUser | null> {
    try {
      await this.initialize()

      console.log(`[CommerceService] Fetching user ${userIdOrLogonId}`)

      // Use Admin v2 API which has broader ACL permissions for CSR/admin access
      // This endpoint allows authenticated admins to access user data
      const url = `${this.baseUrl}/rest/admin/v2/users/${encodeURIComponent(userIdOrLogonId)}?storeId=${this.storeId}`

      console.log(`[CommerceService] Calling URL: ${url}`)

      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      const tokens = this.client.getTokens()
      console.log(
        `[CommerceService] Initialized: ${
          this.initialized
        }, Has WCToken: ${!!tokens.WCToken}, Has WCTrustedToken: ${!!tokens.WCTrustedToken}`,
      )
      if (tokens.WCToken) {
        headers["WCToken"] = tokens.WCToken
      }
      if (tokens.WCTrustedToken) {
        headers["WCTrustedToken"] = tokens.WCTrustedToken
      }

      let response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      })

      // If session expired (401) or unauthorized (403), re-authenticate and retry once
      if (response.status === 401 || response.status === 403) {
        console.warn(`[CommerceService] Auth error (${response.status}), re-authenticating...`)
        this.initialized = false
        await this.initialize()

        // Retry with new tokens
        const newTokens = this.client.getTokens()
        console.log(`[CommerceService] Retrying with new tokens - Has WCToken: ${!!newTokens.WCToken}`)
        if (newTokens.WCToken) {
          headers["WCToken"] = newTokens.WCToken
        }
        if (newTokens.WCTrustedToken) {
          headers["WCTrustedToken"] = newTokens.WCTrustedToken
        }

        response = await fetch(url, {
          method: "GET",
          headers,
          credentials: "include",
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[CommerceService] API error: ${response.status} - ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      // Handle different response formats from Commerce API
      let user
      if (Array.isArray(data)) {
        // Direct array response
        user = data[0]
      } else if (data.userDataBeans && Array.isArray(data.userDataBeans)) {
        // Commerce 9.x search endpoint returns { userDataBeans: [...] }
        user = data.userDataBeans[0]
      } else if (data.users && Array.isArray(data.users)) {
        // Some endpoints return { users: [...] }
        user = data.users[0]
      } else if (data.userId || data.id) {
        // Direct user object - Admin v2 API uses 'id', standard API uses 'userId'
        user = data
      } else {
        user = null
      }

      if (!user) {
        console.warn(`[CommerceService] No user found in response (recordSetTotal: ${data.recordSetTotal || 0})`)
        return null
      }

      // Admin v2 API has different field structure
      // Extract phone from address object if available, otherwise try direct phone1 field
      let phone = user.phone1
      if (!phone && user.address && typeof user.address === "object") {
        phone = user.address.phone1 || user.address.phone || user.address.mobilePhone1
      }

      // Extract name fields - Admin v2 uses different structure
      const firstName = user.firstName || user.address?.firstName
      const lastName = user.lastName || user.address?.lastName

      return {
        userId: user.userId || user.id,
        logonId: user.logonId,
        firstName: firstName,
        lastName: lastName,
        phone1: phone,
        email1: user.email1 || user.address?.email1,
      }
    } catch (error) {
      console.error(`[CommerceService] Failed to fetch user ${userIdOrLogonId}:`, error)
      return null
    }
  }

  /**
   * Get user's wishlist items
   * Returns array of wishlist items with part numbers
   */
  async getUserWishlist(userId: string): Promise<CommerceWishlistItem[]> {
    try {
      await this.initialize()

      console.log(`[CommerceService] Fetching wishlist for user ${userId}`)

      // Build full URL manually due to SDK bug with useProxy: false
      const url = this.buildTransactionUrl(`/store/${this.storeId}/wishlist/@self?forUserId=${userId}`)

      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      const tokens = this.client.getTokens()
      if (tokens.WCToken) {
        headers["WCToken"] = tokens.WCToken
      }
      if (tokens.WCTrustedToken) {
        headers["WCTrustedToken"] = tokens.WCTrustedToken
      }

      let response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      })

      // If session expired (401), re-authenticate and retry once
      if (response.status === 401) {
        console.warn("[CommerceService] Session expired (401), re-authenticating...")
        this.initialized = false
        await this.initialize()

        // Retry with new tokens
        const newTokens = this.client.getTokens()
        if (newTokens.WCToken) {
          headers["WCToken"] = newTokens.WCToken
        }
        if (newTokens.WCTrustedToken) {
          headers["WCTrustedToken"] = newTokens.WCTrustedToken
        }

        response = await fetch(url, {
          method: "GET",
          headers,
          credentials: "include",
        })
      }

      // 404 means user has no wishlist - this is not an error, just return empty array
      if (response.status === 404) {
        console.log(`[CommerceService] No wishlist found for user ${userId} (404)`)
        return []
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const data = await response.json()

      if (!data.GiftList || data.GiftList.length === 0) {
        console.log(`[CommerceService] No wishlists found for user ${userId}`)
        return []
      }

      const wishlist = data.GiftList[0]
      const items = wishlist.item || []

      return items.map((item: any) => ({
        partNumber: item.partNumber || "",
        productId: item.productId,
        quantityRequested: item.quantityRequested,
      }))
    } catch (error) {
      console.error(`[CommerceService] Failed to fetch wishlist for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Get user's shopping cart items
   * Returns array of cart items with SKU part numbers
   */
  async getUserCart(userId: string): Promise<CommerceWishlistItem[]> {
    try {
      await this.initialize()

      console.log(`[CommerceService] Fetching cart for user ${userId}`)

      // Build full URL manually due to SDK bug with useProxy: false
      const url = this.buildTransactionUrl(`/store/${this.storeId}/cart/@self?forUserId=${userId}`)

      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      const tokens = this.client.getTokens()
      if (tokens.WCToken) {
        headers["WCToken"] = tokens.WCToken
      }
      if (tokens.WCTrustedToken) {
        headers["WCTrustedToken"] = tokens.WCTrustedToken
      }

      let response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      })

      // If session expired (401), re-authenticate and retry once
      if (response.status === 401) {
        console.warn("[CommerceService] Session expired (401), re-authenticating...")
        this.initialized = false
        await this.initialize()

        // Retry with new tokens
        const newTokens = this.client.getTokens()
        if (newTokens.WCToken) {
          headers["WCToken"] = newTokens.WCToken
        }
        if (newTokens.WCTrustedToken) {
          headers["WCTrustedToken"] = newTokens.WCTrustedToken
        }

        response = await fetch(url, {
          method: "GET",
          headers,
          credentials: "include",
        })
      }

      // 404 means user has no cart - this is not an error, just return empty array
      if (response.status === 404) {
        console.log(`[CommerceService] No cart found for user ${userId} (404)`)
        return []
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const data = await response.json()

      const orderItems = data.orderItem || []

      if (orderItems.length === 0) {
        console.log(`[CommerceService] No items in cart for user ${userId}`)
        return []
      }

      return orderItems.map((item: any) => {
        // Log all available fields to understand cart item structure
        console.log(`[CommerceService] Cart item all fields:`, Object.keys(item))
        console.log(`[CommerceService] Cart item full data:`, JSON.stringify(item, null, 2))

        // Cart API doesn't include product name - only partNumber and productId
        // The "description" field is the shipping method, not the product
        // Product details must be fetched separately using getProductByPartNumber
        return {
          partNumber: item.partNumber || "",
          productId: item.productId,
          quantityRequested: item.quantity,
          name: item.catalogEntryDescription || item.productName || "", // Try these fields
          thumbnail: item.thumbnail,
          unitPrice: item.unitPrice,
          manufacturer: item.manufacturer,
        }
      })
    } catch (error) {
      console.error(`[CommerceService] Failed to fetch cart for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Check inventory for multiple part numbers at a specific location
   * Returns inventory status for each item
   */
  async checkInventory(partNumbers: string[], locationId: string): Promise<InventoryItem[]> {
    if (partNumbers.length === 0) {
      return []
    }

    try {
      await this.initialize()

      console.log(`[CommerceService] Checking inventory for ${partNumbers.length} items at location ${locationId}`)

      const config = this.client.getConfig()
      const storeName = config.storeName || process.env.COMMERCE_STORE_NAME || ""

      const response = await this.client.inventory.getInventoryPlus({
        store: storeName,
        partNumber: partNumbers,
        fulfillmentCenter: locationId,
        limit: partNumbers.length,
      })

      const items = response.contents || []

      return items.map(item => {
        const fc = item.fulfillmentCenters?.[0]
        const qty = Number(fc?.availableQuantity || item.totalAvailableQuantity || 0)

        return {
          partNumber: item.partNumber,
          availableQuantity: qty,
          inventoryStatus: fc?.inventoryStatus || "unknown",
          inStock: qty > 0,
        }
      })
    } catch (error) {
      console.error(`[CommerceService] Failed to check inventory:`, error)
      return []
    }
  }

  /**
   * Get product details by part number or product ID
   * Returns product information including name, price, image
   *
   * The cart returns SKU partNumbers, but we need the parent product name.
   * Strategy: Use transaction API to fetch catalog entry by ID, then get parent if it's a SKU.
   */
  async getProductByPartNumber(partNumber: string, productId?: string): Promise<{
    partNumber: string
    name: string
    brand?: string
    price?: number
    imageUrl?: string
  } | null> {
    try {
      await this.initialize()

      console.log(`[CommerceService] Fetching product for SKU partNumber: ${partNumber}${productId ? ` (SKU ID: ${productId})` : ""}`)

      const langId = "-1"
      const currency = "USD"
      const catalogId = this.client.getConfig().catalogId || process.env.COMMERCE_CATALOG_ID

      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      const tokens = this.client.getTokens()
      if (tokens.WCToken) {
        headers["WCToken"] = tokens.WCToken
      }
      if (tokens.WCTrustedToken) {
        headers["WCTrustedToken"] = tokens.WCTrustedToken
      }

      // If we have a productId, try multiple endpoint variations
      if (productId) {
        console.log(`[CommerceService] Fetching catalog entry by ID: ${productId}`)

        // Try different endpoint paths that HCL Commerce might use
        const endpointVariations = [
          `/store/${this.storeId}/productview/byIds?id=${productId}&langId=${langId}&currency=${currency}&catalogId=${catalogId}`,
          `/store/${this.storeId}/productview/${productId}?langId=${langId}&currency=${currency}&catalogId=${catalogId}`,
          `/store/${this.storeId}/catalog/product/${productId}?langId=${langId}&currency=${currency}`,
        ]

        for (const endpoint of endpointVariations) {
          const productUrl = this.buildTransactionUrl(endpoint)
          console.log(`[CommerceService] Trying endpoint: ${productUrl}`)

          let response = await fetch(productUrl, {
            method: "GET",
            headers,
            credentials: "include",
          })

          if (response.status === 401) {
            console.warn("[CommerceService] Session expired (401), re-authenticating...")
            this.initialized = false
            await this.initialize()

            const newTokens = this.client.getTokens()
            if (newTokens.WCToken) {
              headers["WCToken"] = newTokens.WCToken
            }
            if (newTokens.WCTrustedToken) {
              headers["WCTrustedToken"] = newTokens.WCTrustedToken
            }

            response = await fetch(productUrl, {
              method: "GET",
              headers,
              credentials: "include",
            })
          }

          if (response.ok) {
            const data = await response.json()
            console.log(`[CommerceService] Success with endpoint: ${endpoint}`)
            console.log(`[CommerceService] Response data:`, JSON.stringify(data, null, 2))

            // Handle different response structures
            let catalogEntry = data
            if (data.catalogEntryView && Array.isArray(data.catalogEntryView)) {
              catalogEntry = data.catalogEntryView[0]
            } else if (data.CatalogEntryView && Array.isArray(data.CatalogEntryView)) {
              catalogEntry = data.CatalogEntryView[0]
            }

            if (!catalogEntry) {
              console.warn(`[CommerceService] No catalog entry in response`)
              continue
            }

            // Check if this is a SKU with a parent
            if (catalogEntry.parentCatalogEntryID) {
              console.log(`[CommerceService] SKU has parent: ${catalogEntry.parentCatalogEntryID}, fetching parent...`)

              // Try the same endpoint variations for the parent
              for (const parentEndpoint of endpointVariations) {
                const parentUrl = this.buildTransactionUrl(
                  parentEndpoint.replace(productId, catalogEntry.parentCatalogEntryID),
                )

                const parentResponse = await fetch(parentUrl, {
                  method: "GET",
                  headers,
                  credentials: "include",
                })

                if (parentResponse.ok) {
                  const parentData = await parentResponse.json()
                  let parent = parentData
                  if (parentData.catalogEntryView && Array.isArray(parentData.catalogEntryView)) {
                    parent = parentData.catalogEntryView[0]
                  } else if (parentData.CatalogEntryView && Array.isArray(parentData.CatalogEntryView)) {
                    parent = parentData.CatalogEntryView[0]
                  }

                  if (parent) {
                    console.log(`[CommerceService] Parent product fetched successfully`)
                    const productName = parent.name || parent.shortDescription || parent.longDescription || ""
                    const offerPrice = parent.price?.find((p: Record<string, unknown>) => p.usage === "Offer")
                    const displayPrice = parent.price?.find((p: Record<string, unknown>) => p.usage === "Display")
                    const price = offerPrice?.value || displayPrice?.value

                    return {
                      partNumber: parent.partNumber || partNumber,
                      name: productName,
                      brand: parent.manufacturer,
                      price: price ? Number(price) : undefined,
                      imageUrl: parent.thumbnail || parent.fullImage,
                    }
                  }
                }
              }
            }

            // No parent or couldn't fetch it, use the catalog entry itself
            const productName = catalogEntry.name || catalogEntry.shortDescription || catalogEntry.longDescription || ""
            const offerPrice = catalogEntry.price?.find((p: Record<string, unknown>) => p.usage === "Offer")
            const displayPrice = catalogEntry.price?.find((p: Record<string, unknown>) => p.usage === "Display")
            const price = offerPrice?.value || displayPrice?.value

            return {
              partNumber: catalogEntry.partNumber || partNumber,
              name: productName,
              brand: catalogEntry.manufacturer,
              price: price ? Number(price) : undefined,
              imageUrl: catalogEntry.thumbnail || catalogEntry.fullImage,
            }
          } else {
            console.log(`[CommerceService] Endpoint ${endpoint} returned ${response.status}`)
          }
        }

        console.warn(`[CommerceService] All productId endpoint variations failed`)
      }

      // Fallback: Search by partNumber
      console.log(`[CommerceService] Searching by partNumber in search API: ${partNumber}`)
      const config = this.client.getConfig()
      const contractId = config.contractId || process.env.COMMERCE_CONTRACT_ID

      const searchUrl = this.buildSearchUrl(
        `/api/v2/products?storeId=${this.storeId}&catalogId=${catalogId}&contractId=${contractId}&langId=${langId}&currency=${currency}&partNumber=${encodeURIComponent(
          partNumber,
        )}`,
      )

      const response = await fetch(searchUrl, {
        method: "GET",
        headers,
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[CommerceService] Search response:`, JSON.stringify(data, null, 2))

        const product = data.contents?.[0]
        if (product) {
          const productName = product.name || product.shortDescription || product.longDescription || ""
          const offerPrice = product.price?.find((p: Record<string, unknown>) => p.usage === "Offer")
          const displayPrice = product.price?.find((p: Record<string, unknown>) => p.usage === "Display")
          const price = offerPrice?.value || displayPrice?.value

          return {
            partNumber: product.partNumber,
            name: productName,
            brand: product.manufacturer,
            price: price ? Number(price) : undefined,
            imageUrl: product.thumbnail || product.fullImage,
          }
        }
      }

      console.log(`[CommerceService] Product ${partNumber} not found`)
      return null
    } catch (error) {
      console.error(`[CommerceService] Failed to fetch product ${partNumber}:`, error)
      return null
    }
  }
}

// Export singleton instance
export const commerceService = new CommerceService()
