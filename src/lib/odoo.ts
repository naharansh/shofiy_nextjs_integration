import xmlrpc from "xmlrpc"
import type { OdooOrder, OdooOrderLine } from "@/lib/types"

const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!
const ODOO_USERNAME = process.env.ODOO_USERNAME!
const ODOO_PASSWORD = process.env.ODOO_PASSWORD!

let uidCache: number | null = null

function createOdooClient(path: string) {
  const url = new URL(ODOO_URL)
  const opts = {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 8069,
    path,
  }
  return url.protocol === "https:"
    ? xmlrpc.createSecureClient(opts)
    : xmlrpc.createClient(opts)
}

function getCommonClient() {
  return createOdooClient("/xmlrpc/2/common")
}

function getObjectClient() {
  return createOdooClient("/xmlrpc/2/object")
}

function methodCall<T>(
  client: xmlrpc.Client,
  method: string,
  params: unknown[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (error, value) => {
      if (error) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error)
        reject(new Error(`Odoo XML-RPC error: ${msg}`))
      } else {
        resolve(value as T)
      }
    })
  })
}

export async function authenticate(): Promise<number> {
  if (uidCache) return uidCache

  const client = getCommonClient()
  const uid = await methodCall<number>(client, "authenticate", [
    ODOO_DB,
    ODOO_USERNAME,
    ODOO_PASSWORD,
    {},
  ])

  if (!uid || uid === 0) {
    throw new Error("Odoo authentication failed – invalid credentials")
  }

  uidCache = uid
  return uid
}

export async function createProductOnOdoo(data: {
  title: string
  descriptionHtml?: string
  price?: string
  imageUrl?: string
  imageAlt?: string
}) {
  const uid = await authenticate()
  const client = getObjectClient()

  const fields: Record<string, unknown> = {
    name: data.title,
    type: "consu",
    sale_ok: true,
    purchase_ok: true,
  }

  if (data.descriptionHtml) {
    fields["description"] = data.descriptionHtml
    fields["description_sale"] = data.descriptionHtml
  }

  if (data.price) {
    fields["list_price"] = Number(data.price)
  }

  const productId = await methodCall<number>(client, "execute_kw", [
    ODOO_DB,
    uid,
    ODOO_PASSWORD,
    "product.template",
    "create",
    [fields],
  ])

  if (data.imageUrl) {
    try {
      const imgRes = await fetch(data.imageUrl)
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
      const base64 = imgBuffer.toString("base64")

      await methodCall<number>(client, "execute_kw", [
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        "product.template",
        "write",
        [[productId], { image_1920: base64 }],
      ])
    } catch {
      console.warn("Failed to upload image to Odoo, product created without image")
    }
  }

  return { id: productId, title: data.title }
}

export async function fetchOdooOrders(limit = 50) {
  const uid = await authenticate()
  const client = getObjectClient()

  const orders = await methodCall<OdooOrder[]>(client, "execute_kw", [
    ODOO_DB, uid, ODOO_PASSWORD,
    "sale.order", "search_read",
    [[]],
    {
      fields: ["name", "state", "date_order", "amount_total", "amount_untaxed", "currency_id", "partner_id", "partner_shipping_id", "order_line"],
      order: "date_order desc",
      limit,
    },
  ])

  if (orders.length === 0) return []

  const allLineIds = orders.flatMap((o) => o.order_line.flat())
  let lineMap: Record<number, OdooOrderLine> = {}

  if (allLineIds.length > 0) {
    const lines = await methodCall<OdooOrderLine[]>(client, "execute_kw", [
      ODOO_DB, uid, ODOO_PASSWORD,
      "sale.order.line", "read",
      [allLineIds],
      { fields: ["name", "product_uom_qty", "price_unit", "price_subtotal"] },
    ])
    lineMap = Object.fromEntries(lines.map((l) => [l.id, l]))
  }

  return orders.map((order) => ({
    ...order,
    resolvedLines: order.order_line.flat().map((lineId: number) => lineMap[lineId]).filter(Boolean) as OdooOrderLine[],
  }))
}

async function readOdooOrderState(orderId: number): Promise<string> {
  const uid = await authenticate()
  const client = getObjectClient()

  const records = await methodCall<Array<{ state: string }>>(client, "execute_kw", [
    ODOO_DB, uid, ODOO_PASSWORD,
    "sale.order", "read",
    [[orderId]],
    { fields: ["state"] },
  ])

  if (!records || records.length === 0) {
    throw new Error(`Odoo order ${orderId} not found`)
  }

  return records[0].state
}

export async function updateOdooOrderStatus(
  orderId: number,
  fulfillmentStatus: string
): Promise<{ success: boolean; status: string }> {
  const uid = await authenticate()
  const client = getObjectClient()

  const currentState = await readOdooOrderState(orderId)

  const validTransitions: Record<string, string[]> = {
    draft: ["sale", "done", "cancel"],
    sent: ["sale", "done", "cancel"],
    sale: ["done", "cancel"],
    done: [],
    cancel: [],
  }

  const targetMap: Record<string, string> = {
    UNFULFILLED: "sale",
    IN_PROGRESS: "draft",
    FULFILLED: "done",
  }

  const targetState = targetMap[fulfillmentStatus]
  if (!targetState) {
    throw new Error(`Unknown fulfillment status: ${fulfillmentStatus}`)
  }

  if (currentState === targetState) {
    return { success: true, status: fulfillmentStatus }
  }

  const effectiveTarget = targetState === "done" ? "sale" : targetState
  if (currentState === effectiveTarget) {
    return { success: true, status: fulfillmentStatus }
  }

  const allowed = validTransitions[currentState] || []
  if (!allowed.includes(targetState)) {
    if (currentState === "done" && targetState === "sale") {
      throw new Error(
        `Cannot reverse a completed Odoo order. Current state: ${currentState}. Odoo does not allow going from "done" back to "sale".`
      )
    }
    if (currentState === "cancel") {
      throw new Error(
        `Cannot update a cancelled Odoo order. Current state: cancel.`
      )
    }
    throw new Error(
      `Cannot transition Odoo order from "${currentState}" to "${targetState}". Allowed transitions: ${allowed.join(", ") || "none"}`
    )
  }

  const needsConfirm = currentState === "draft" || currentState === "sent"

  if (targetState === "cancel") {
    await methodCall<boolean>(client, "execute_kw", [
      ODOO_DB, uid, ODOO_PASSWORD,
      "sale.order", "action_cancel",
      [[orderId]],
    ])
  } else if (needsConfirm) {
    await methodCall<boolean>(client, "execute_kw", [
      ODOO_DB, uid, ODOO_PASSWORD,
      "sale.order", "action_confirm",
      [[orderId]],
    ])
  }

  const newState = await readOdooOrderState(orderId)
  if (newState !== effectiveTarget) {
    throw new Error(
      `Odoo order state update did not take effect. Expected "${effectiveTarget}", got "${newState}".`
    )
  }

  return { success: true, status: fulfillmentStatus }
}
