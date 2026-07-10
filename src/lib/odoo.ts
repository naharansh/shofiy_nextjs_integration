import xmlrpc from "xmlrpc"
import type { OdooOrder, OdooOrderLine } from "@/lib/types"

const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!
const ODOO_USERNAME = process.env.ODOO_USERNAME!
const ODOO_PASSWORD = process.env.ODOO_PASSWORD!

let uidCache: number | null = null

function getCommonClient() {
  const url = new URL(ODOO_URL)
  return xmlrpc.createClient({
    host: url.hostname,
    port: url.port ? Number(url.port) : 8069,
    path: "/xmlrpc/2/common",
  })
}

function getObjectClient() {
  const url = new URL(ODOO_URL)
  return xmlrpc.createClient({
    host: url.hostname,
    port: url.port ? Number(url.port) : 8069,
    path: "/xmlrpc/2/object",
  })
}

function methodCall<T>(
  client: xmlrpc.Client,
  method: string,
  params: unknown[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (error, value) => {
      if (error) reject(new Error(`Odoo XML-RPC error: ${(error as Error).message}`))
      else resolve(value as T)
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
