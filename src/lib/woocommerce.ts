import type { WooCommerceOrder } from "@/lib/types"

const WC_URL = process.env.WOOCOMMERCE_URL!
const WC_CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY!
const WC_CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET!

const API_VERSION = "wc/v3"

function getAuthHeader(): string {
  const token = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString("base64")
  return `Basic ${token}`
}

export async function createProductOnWooCommerce(data: {
  title: string
  descriptionHtml?: string
  price?: string
  imageUrl?: string
  imageAlt?: string
}) {
  const body: Record<string, unknown> = {
    name: data.title,
    type: "simple",
    status: "publish",
  }

  if (data.descriptionHtml) {
    body["description"] = data.descriptionHtml
  }

  if (data.price) {
    body["regular_price"] = String(data.price)
  }

  if (data.imageUrl) {
    body["images"] = [
      {
        src: data.imageUrl,
        alt: data.imageAlt || data.title,
      },
    ]
  }

  const url = `${WC_URL.replace(/\/+$/, "")}/wp-json/${API_VERSION}/products`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(
      `WooCommerce API error (${res.status}): ${errBody.slice(0, 300)}`
    )
  }

  const product: { id: number; name: string; permalink: string } =
    await res.json()

  return { id: product.id, title: product.name, permalink: product.permalink }
}

export async function fetchWooCommerceOrders(limit = 50) {
  const url = `${WC_URL.replace(/\/+$/, "")}/wp-json/${API_VERSION}/orders?per_page=${limit}&orderby=date&order=desc`

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(
      `WooCommerce API error (${res.status}): ${errBody.slice(0, 300)}`
    )
  }

  const orders: WooCommerceOrder[] = await res.json()
  return orders
}
