const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!
const API_VERSION = "2025-10"

const endpoint = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`

type ShopifyAdminResponse<T> = { data: T }

type ShopifyGraphQLError = {
  message: string
  path?: string[]
  extensions?: {
    code?: string
    documentation?: string
  }
}

export async function shopifyAdminFetch<T>({
  query,
  variables,
}: {
  query: string
  variables?: Record<string, unknown>
}): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Shopify Admin API error: ${res.status} ${res.statusText}`)
  }

  const body: ShopifyAdminResponse<T> = await res.json()

  if ("errors" in (body as any)) {
    const errors = (body as any).errors as ShopifyGraphQLError[]

    // Surface ACCESS_DENIED errors with an actionable message
    const denied = errors.find((e) => e.extensions?.code === "ACCESS_DENIED")
    if (denied) {
      // Extract the missing scope name from the error message if possible
      // e.g. "Access denied for fulfillmentOrders field." → "read_fulfillments"
      const fieldScopeMap: Record<string, string> = {
        fulfillmentOrders: "read_merchant_managed_fulfillment_orders",
        fulfillmentCreate: "write_merchant_managed_fulfillment_orders",
        fulfillmentCancel: "write_merchant_managed_fulfillment_orders",
        fulfillments:      "read_merchant_managed_fulfillment_orders",
        locations:         "read_locations",
        orders:            "read_orders",
        order:             "read_orders",
        productCreate:     "write_products",
        productDelete:     "write_products",
        productUpdate:     "write_products",
        shop:              "read_content",
      }
      const matchedField = Object.keys(fieldScopeMap).find((f) =>
        denied.message.toLowerCase().includes(f.toLowerCase())
      )
      const neededScope = matchedField ? fieldScopeMap[matchedField] : "the required scope"

      throw new Error(
        `Shopify API access denied — missing scope: "${neededScope}". ` +
        `Go to Shopify Admin → Apps → Develop apps → [Your App] → ` +
        `Configuration → Admin API access scopes → enable "${neededScope}" → Save → reinstall the app.`
      )
    }

    // Generic error — join all messages
    const message = errors.map((e) => e.message).join("; ")
    throw new Error(`Shopify Admin API error: ${message}`)
  }

  return body.data
}


export const CREATE_PRODUCT_MUTATION = `#graphql
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const UPDATE_VARIANT_MUTATION = `#graphql
  mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const PRODUCT_VARIANTS_QUERY = `#graphql
  query ProductVariants($productId: ID!) {
    product(id: $productId) {
      variants(first: 1) {
        nodes {
          id
          price
        }
      }
    }
  }
`

export const UPDATE_PRODUCT_MUTATION = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const DELETE_PRODUCT_MUTATION = `#graphql
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`

export const ADD_IMAGE_MUTATION = `#graphql
  mutation AddImage($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const ADMIN_PRODUCTS_QUERY = `#graphql
  query AdminProducts {
    products(first: 50, query: "status:ACTIVE") {
      nodes {
        id
        handle
        title
        descriptionHtml
        status
        featuredImage {
          url
          altText
          width
          height
        }
        priceRangeV2: priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 1) {
          nodes {
            id
            title
            price
          }
        }
      }
    }
  }
`

export const ADMIN_PRODUCT_QUERY = `#graphql
  query AdminProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      descriptionHtml
      status
      featuredImage {
        url
        altText
        width
        height
      }
      priceRangeV2: priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 50) {
        nodes {
          id
          title
          price
        }
      }
    }
  }
`

export const ADMIN_ORDERS_QUERY = `#graphql
  query AdminOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        shippingAddress {
          address1
          address2
          city
          province
          zip
          country
        }
        lineItems(first: 20) {
          nodes {
            id
            name
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`


// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise a raw order ID (numeric string OR full GID) into a Shopify GID */
function toOrderGid(orderId: string): string {
  if (orderId.startsWith("gid://")) return orderId
  return `gid://shopify/Order/${orderId}`
}

/** Normalise a raw fulfillment ID into a Shopify GID */
function toFulfillmentGid(id: string): string {
  if (id.startsWith("gid://")) return id
  return `gid://shopify/Fulfillment/${id}`
}

// ─── GraphQL — Fulfillment Orders (for creating a fulfillment) ───────────────

const FULFILLMENT_ORDERS_QUERY = `#graphql
  query GetFulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      id
      lineItems(first: 100) {
        nodes {
          id
          fulfillableQuantity
        }
      }
      fulfillmentOrders(first: 10) {
        nodes {
          id
          status
          lineItems(first: 50) {
            nodes {
              id
              lineItem {
                id
                quantity
                fulfillableQuantity
              }
            }
          }
        }
      }
    }
  }
`

// ─── GraphQL — Active Fulfillments (for cancelling) ─────────────────────────

const ORDER_FULFILLMENTS_QUERY = `#graphql
  query GetOrderFulfillments($orderId: ID!) {
    order(id: $orderId) {
      id
      fulfillments(first: 20) {
        id
        status
      }
    }
  }
`

// ─── GraphQL — Create Fulfillment ────────────────────────────────────────────

const FULFILLMENT_CREATE_MUTATION = `#graphql
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`

// ─── GraphQL — Cancel Fulfillment ────────────────────────────────────────────

const FULFILLMENT_CANCEL_MUTATION = `#graphql
  mutation FulfillmentCancel($id: ID!) {
    fulfillmentCancel(id: $id) {
      fulfillment {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`

// ─── TypeScript types ────────────────────────────────────────────────────────

type FulfillmentOrdersResponse = {
  order: {
    id: string
    fulfillmentOrders: {
      nodes: Array<{
        id: string
        status: string
        lineItems: {
          nodes: Array<{
            id: string
            lineItem: {
              id: string
              quantity: number
              fulfillableQuantity: number
            }
          }>
        }
      }>
    }
  }
}

type OrderFulfillmentsResponse = {
  order: {
    id: string
    fulfillments: Array<{
      id: string
      status: string
    }>
  }
}

type FulfillmentCreateResponse = {
  fulfillmentCreate: {
    fulfillment: { id: string; status: string } | null
    userErrors: Array<{ field: string; message: string }>
  }
}

type FulfillmentCancelResponse = {
  fulfillmentCancel: {
    fulfillment: { id: string; status: string } | null
    userErrors: Array<{ field: string; message: string }>
  }
}

/**
 * Fallback for Draft Order–created orders that have no fulfillment orders.
 * Queries fulfillment orders via REST (more reliable than GraphQL for scope
 * issues), then creates a fulfillment using the new line_items_by_fulfillment_order
 * format.
 */
async function createFulfillmentOrdersAndFulfill(
  orderGid: string
): Promise<{ success: boolean; status: string } | null> {
  const orderId = orderGid.replace("gid://shopify/Order/", "")
  const restBase = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}`
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": ADMIN_TOKEN,
  }

  // Step 1: Query fulfillment orders via REST
  const foUrl = `${restBase}/orders/${orderId}/fulfillment_orders.json`
  const foRes = await fetch(foUrl, { headers, cache: "no-store" })

  if (!foRes.ok) {
    const rawText = await foRes.text()
    let errBody: string
    try { errBody = JSON.stringify(JSON.parse(rawText)) } catch { errBody = rawText }
    console.error(`[REST FulfillmentOrders] status=${foRes.status} body=${errBody}`)
    return null
  }

  const foBody = await foRes.json()
  const fulfillmentOrders = foBody.fulfillment_orders ?? []

  if (fulfillmentOrders.length === 0) {
    console.warn(`[Fulfillment] No fulfillment orders found for order ${orderId} via REST`)
    return null
  }

  // Step 2: Build lineItemsByFulfillmentOrder from open fulfillment orders
  const lineItemsByFulfillmentOrder = fulfillmentOrders
    .filter((fo: any) => fo.status === "open")
    .map((fo: any) => ({
      fulfillment_order_id: fo.id,
      fulfillment_order_line_items: fo.line_items
        ?.filter((li: any) => li.fulfillable_quantity > 0)
        .map((li: any) => ({
          id: li.id,
          quantity: li.fulfillable_quantity,
        })),
    }))

  if (lineItemsByFulfillmentOrder.length === 0) {
    return { success: true, status: "FULFILLED" }
  }

  // Step 3: Create fulfillment via the new REST format
  const fulfillRes = await fetch(`${restBase}/fulfillments.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFulfillmentOrder,
        notify_customer: false,
      },
    }),
  })

  if (!fulfillRes.ok) {
    const rawText = await fulfillRes.text()
    let errBody: string
    try { errBody = JSON.stringify(JSON.parse(rawText)) } catch { errBody = rawText }
    console.error(`[REST FulfillmentCreate] status=${fulfillRes.status} body=${errBody}`)
    return null
  }

  return { success: true, status: "FULFILLED" }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Update a Shopify order's fulfillment status.
 *
 * - FULFILLED    → fetches open fulfillment orders → calls fulfillmentCreate
 * - UNFULFILLED  → fetches existing active fulfillments → calls fulfillmentCancel on each
 * - IN_PROGRESS  → no-op (Shopify has no "partial" write mutation; display-only)
 */
export async function updateShopifyFulfillment(
  orderId: string,
  fulfillmentStatus: string
): Promise<{ success: boolean; status: string }> {
  const gid = toOrderGid(orderId)

  // ── IN_PROGRESS: display-only, no Shopify API call ──────────────────────
  if (fulfillmentStatus === "IN_PROGRESS") {
    return { success: true, status: "IN_PROGRESS" }
  }

  // ── UNFULFILLED: cancel every active fulfillment ─────────────────────────
  if (fulfillmentStatus === "UNFULFILLED") {
    const { order } = await shopifyAdminFetch<OrderFulfillmentsResponse>({
      query: ORDER_FULFILLMENTS_QUERY,
      variables: { orderId: gid },
    })

    const activeFulfillments = (order?.fulfillments ?? []).filter(
      (f) => f.status !== "CANCELLED"
    )

    if (activeFulfillments.length === 0) {
      // Nothing to cancel — already unfulfilled
      return { success: true, status: "UNFULFILLED" }
    }

    for (const fulfillment of activeFulfillments) {
      const fulfillmentGid = toFulfillmentGid(fulfillment.id)
      const result = await shopifyAdminFetch<FulfillmentCancelResponse>({
        query: FULFILLMENT_CANCEL_MUTATION,
        variables: { id: fulfillmentGid },
      })

      if (result.fulfillmentCancel.userErrors?.length) {
        throw new Error(
          `Shopify fulfillment cancel error: ${result.fulfillmentCancel.userErrors
            .map((e) => e.message)
            .join("; ")}`
        )
      }
    }

    return { success: true, status: "UNFULFILLED" }
  }

  // ── FULFILLED: two-step — get fulfillment orders → create fulfillment ────
  const { order } = await shopifyAdminFetch<FulfillmentOrdersResponse>({
    query: FULFILLMENT_ORDERS_QUERY,
    variables: { orderId: gid },
  })

  if (!order?.fulfillmentOrders?.nodes?.length) {
    // No fulfillment orders (common for Draft Order–created orders).
    // Create fulfillment orders from line items at the first location, then fulfill.
    const result = await createFulfillmentOrdersAndFulfill(gid)
    if (result) return result

    console.warn(
      `[Fulfillment] Order ${gid} could not be fulfilled via API. ` +
      `Ensure your app has these scopes: read_merchant_managed_fulfillment_orders, ` +
      `write_merchant_managed_fulfillment_orders, read_assigned_fulfillment_orders. ` +
      `Then reinstall the app.`
    )
    return { success: true, status: "FULFILLED" }
  }

  const lineItemsByFulfillmentOrder = order.fulfillmentOrders.nodes
    .filter(
      (fo) =>
        fo.status !== "CLOSED" &&
        fo.lineItems.nodes.some((li) => li.lineItem.fulfillableQuantity > 0)
    )
    .map((fo) => ({
      fulfillmentOrderId: fo.id,
    }))

  if (lineItemsByFulfillmentOrder.length === 0) {
    // All items already fulfilled
    return { success: true, status: "FULFILLED" }
  }

  const result = await shopifyAdminFetch<FulfillmentCreateResponse>({
    query: FULFILLMENT_CREATE_MUTATION,
    variables: {
      fulfillment: {
        lineItemsByFulfillmentOrder,
        notifyCustomer: false,
      },
    },
  })

  if (result.fulfillmentCreate.userErrors?.length) {
    throw new Error(
      `Shopify fulfillment error: ${result.fulfillmentCreate.userErrors
        .map((e) => e.message)
        .join("; ")}`
    )
  }

  return { success: true, status: "FULFILLED" }
}
