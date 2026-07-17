import type { OdooOrder, OdooOrderLine } from "@/lib/types"

const ODOO_URL = process.env.ODOO_URL!
const ODOO_API_KEY = process.env.ODOO_API_KEY!

function getBaseUrl() {
  return ODOO_URL.replace(/\/+$/, "")
}

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ODOO_API_KEY}`,
  }
}

async function odooFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Odoo shopfify API error (${res.status}): ${body.slice(0, 300)}`
    )
  }

  return res.json() as Promise<T>
}

export async function createProductOnOdoo(data: {
  title: string
  descriptionHtml?: string
  price?: string
  imageUrl?: string
  imageAlt?: string
  externalId?: string
}) {
  const body: Record<string, unknown> = {
    title: data.title,
  }

  if (data.descriptionHtml) {
    body.description = data.descriptionHtml
  }

  if (data.price) {
    body.price = Number(data.price)
  }

  if (data.imageUrl) {
    body.imageUrl = data.imageUrl
  }

  if (data.externalId) {
    body.externalId = data.externalId
  }

  const result = await odooFetch<{ id: number; title: string }>(
    "/shopfify/api/products",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  )

  return { id: result.id, title: result.title }
}

export async function updateProductOnOdoo(
  odooProductId: number,
  data: {
    title: string
    descriptionHtml?: string
    price?: string
    imageUrl?: string
  }
) {
  const body: Record<string, unknown> = {}

  if (data.title) {
    body.title = data.title
  }

  if (data.descriptionHtml !== undefined) {
    body.description = data.descriptionHtml
  }

  if (data.price !== undefined && data.price !== "") {
    body.price = Number(data.price)
  }

  if (data.imageUrl) {
    body.imageUrl = data.imageUrl
  }

  const result = await odooFetch<{ id: number; title: string }>(
    `/shopfify/api/products/${odooProductId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  )

  return { id: result.id, title: result.title }
}

export async function searchProductsOnOdoo(title: string) {
  const params = new URLSearchParams({ search: title, limit: "10" })
  const result = await odooFetch<{
    products: Array<{ id: number; title: string; price: number; description: string }>
  }>(`/shopfify/api/products?${params}`)

  return result.products.filter(
    (p) => p.title.toLowerCase() === title.toLowerCase()
  )
}

export async function deleteProductOnOdoo(odooProductId: number) {
  await odooFetch<{ success: boolean }>(
    `/shopfify/api/products/${odooProductId}`,
    { method: "DELETE" }
  )

  return { success: true }
}

export async function fetchOdooOrders(limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  const result = await odooFetch<{ orders: OdooOrderRestResponse[] }>(
    `/shopfify/api/orders?${params}`
  )

  if (!result.orders || result.orders.length === 0) return []

  return result.orders.map((order) => ({
    id: order.id,
    name: order.name,
    state: order.state,
    date_order: order.date_order,
    amount_total: order.amount_total,
    amount_untaxed: order.amount_untaxed,
    currency_id: order.currency_id,
    partner_id: order.partner_id,
    partner_shipping_id: order.partner_shipping_id,
    order_line: order.order_line.map((line) => [line.id]),
    resolvedLines: order.order_line as unknown as OdooOrderLine[],
  }))
}

export async function updateOdooOrderStatus(
  orderId: number,
  fulfillmentStatus: string
): Promise<{ success: boolean; status: string }> {
  const stateMap: Record<string, string> = {
    UNFULFILLED: "sale",
    IN_PROGRESS: "draft",
    FULFILLED: "done",
  }

  const targetState = stateMap[fulfillmentStatus]
  if (!targetState) {
    throw new Error(`Unknown fulfillment status: ${fulfillmentStatus}`)
  }

  const result = await odooFetch<{ success: boolean; state: string }>(
    `/shopfify/api/orders/${orderId}`,
    {
      method: "PUT",
      body: JSON.stringify({ state: targetState }),
    }
  )

  if (!result.success) {
    throw new Error(`Failed to update Odoo order ${orderId} status`)
  }

  return { success: true, status: fulfillmentStatus }
}

type OdooOrderRestResponse = {
  id: number
  name: string
  state: string
  date_order: string
  amount_total: number
  amount_untaxed: number
  currency_id: [number, string]
  partner_id: [number, string] | false
  partner_shipping_id: [number, string] | false
  order_line: Array<{
    id: number
    name: string
    product_uom_qty: number
    price_unit: number
    price_subtotal: number
  }>
}
