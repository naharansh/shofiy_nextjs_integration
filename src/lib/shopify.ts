const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!
const API_VERSION = "2024-10"

const endpoint = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`

type ShopifyResponse<T> = { data: T }

export async function shopifyFetch<T>({
  query,
  variables,
  tags,
}: {
  query: string
  variables?: Record<string, unknown>
  tags?: string[]
}): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    next: { tags },
  })

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`)
  }

  const body: ShopifyResponse<T> = await res.json()
  return body.data
}
