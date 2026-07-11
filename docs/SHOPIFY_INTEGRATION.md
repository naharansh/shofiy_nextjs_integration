# Shopify + Next.js Integration Guide

This guide covers integrating Shopify's Storefront and Admin APIs into a Next.js 14 App Router project with full CRUD capabilities, image uploads, and a shadcn/ui frontend.

---

## 1. Prerequisites

- **Node.js** 18+ and **npm**
- A **Shopify store** (create a [development store](https://help.shopify.com/en/partners/dashboard/managing-stores/development-stores) for testing)
- A Shopify Partners account (to generate Admin API tokens)

---

## 2. Project Setup

```bash
npx create-next-app@latest my-shopify-app --typescript --app-router
cd my-shopify-app
```

Install Tailwind CSS and shadcn/ui:

```bash
npm install tailwindcss@3 postcss autoprefixer class-variance-authority clsx tailwind-merge tailwindcss-animate lucide-react @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-alert-dialog
```

Create `tailwind.config.ts`, `postcss.config.js`, and `src/lib/utils.ts` per [shadcn/ui manual setup](https://ui.shadcn.com/docs/installation/manual). Then add UI components (`button`, `card`, `input`, `textarea`, `label`, `alert-dialog`) under `src/components/ui/`.

---

## 3. Environment Variables

Create `.env.local` in the project root:

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-storefront-token
SHOPIFY_ADMIN_ACCESS_TOKEN=your-admin-token
```

### Where to find each token

| Token                    | Location in Shopify Admin                                                                 |
|--------------------------|-------------------------------------------------------------------------------------------|
| Storefront API token     | **Settings → Sales channels → Shopfront → API → Storefront API access tokens**            |
| Admin API token          | **Apps → Develop apps → Create an app → Admin API → Configure scopes → Issue token**      |

> **Admin API scopes needed**:
>
> | Scope | Purpose |
> |---|---|
> | `read_products` | List/view products |
> | `write_products` | Create/update/delete products |
> | `read_product_listings` | Storefront product listings |
> | `write_product_listings` | Publish products to sales channels |
> | `read_orders` | Query orders |
> | `read_merchant_managed_fulfillment_orders` | Read fulfillment orders for merchant-managed locations |
> | `write_merchant_managed_fulfillment_orders` | Create fulfillments for merchant-managed locations |
> | `read_assigned_fulfillment_orders` | Read fulfillment orders assigned to your app |
> | `write_assigned_fulfillment_orders` | Create fulfillments for orders assigned to your app |
> | `read_locations` | Query shop locations (needed for Draft Order fulfillment fallback) |
> | `read_content` | Query shop info |
>
> **Important**: Without the `*_merchant_managed_fulfillment_orders` scopes, Shopify silently returns empty fulfillment order arrays instead of errors. This causes the legacy REST `POST /orders/{id}/fulfillments.json` path to be triggered, which returns `406 Not Acceptable` in API version `2024-10` and later.

---

## 4. Storefront API Client (`src/lib/shopify.ts`)

The Storefront API is public-facing and used for read-only product queries on a storefront.

```typescript
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
    next: { tags },     // Next.js data cache tags
  })
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)
  const body: ShopifyResponse<T> = await res.json()
  return body.data
}
```

### When to use the Storefront API

- Product detail and listing pages on a **public storefront**
- You only need **read** access
- The API token has `write_publications` scope (so new products appear)

### Limitations

- Products created via the Admin API may **not appear** if the Storefront API token lacks `write_publications` scope
- Only supports `query` and `productByHandle` queries — no mutations

---

## 5. Admin API Client (`src/lib/shopify-admin.ts`)

The Admin API is the recommended approach for building an **admin panel** with full CRUD.

```typescript
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!
const API_VERSION = "2024-10"
const endpoint = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`

type ShopifyAdminResponse<T> = { data: T }

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
    cache: "no-store",     // required — otherwise responses are stale
  })
  if (!res.ok) throw new Error(`Shopify Admin API error: ${res.status}`)
  const body: ShopifyAdminResponse<T> = await res.json()
  if ("errors" in (body as any)) throw new Error(JSON.stringify((body as any).errors))
  return body.data
}
```

> **⚠️ Important**: Always use `cache: "no-store"` on Admin API fetches. Next.js `force-dynamic` on the page alone is **not sufficient** — the `fetch` itself will cache.

### Key GraphQL Queries & Mutations

```typescript
// List active products
export const ADMIN_PRODUCTS_QUERY = `#graphql
  query AdminProducts {
    products(first: 50, query: "status:ACTIVE") {
      nodes {
        id, handle, title, descriptionHtml, status
        featuredImage { url, altText, width, height }
        priceRangeV2: priceRange {
          minVariantPrice { amount, currencyCode }
          maxVariantPrice { amount, currencyCode }
        }
        variants(first: 1) {
          nodes { id, title, price }
        }
      }
    }
  }
`

// Single product by handle
export const ADMIN_PRODUCT_QUERY = `#graphql
  query AdminProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id, handle, title, descriptionHtml, status
      featuredImage { url, altText, width, height }
      priceRangeV2: priceRange {
        minVariantPrice { amount, currencyCode }
        maxVariantPrice { amount, currencyCode }
      }
      variants(first: 50) {
        nodes { id, title, price }
      }
    }
  }
`

// Create product
export const CREATE_PRODUCT_MUTATION = `#graphql
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product { id, title, handle, descriptionHtml }
      userErrors { field, message }
    }
  }
`

// Update title/description
export const UPDATE_PRODUCT_MUTATION = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id, title, handle, descriptionHtml }
      userErrors { field, message }
    }
  }
`

// Update variant price
export const UPDATE_VARIANT_MUTATION = `#graphql
  mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id, title, price }
      userErrors { field, message }
    }
  }
`

// Delete product
export const DELETE_PRODUCT_MUTATION = `#graphql
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field, message }
    }
  }
`

// List recent orders
export const ADMIN_ORDERS_QUERY = `#graphql
  query AdminOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id, name, createdAt, processedAt
        displayFinancialStatus, displayFulfillmentStatus
        totalPriceSet { shopMoney { amount, currencyCode } }
        subtotalPriceSet { shopMoney { amount, currencyCode } }
        totalTaxSet { shopMoney { amount, currencyCode } }
        shippingAddress { address1, address2, city, province, zip, country }
        lineItems(first: 20) {
          nodes { id, name, quantity, originalUnitPriceSet { shopMoney { amount, currencyCode } }, product { id } }
        }
      }
      pageInfo { hasNextPage, endCursor }
    }
  }
`
```

---

## 6. API Routes

All routes live under `src/app/api/products/`.

### GET /api/products?handle=

Fetches product data for the edit form.

```typescript
// src/app/api/products/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get("handle")
  if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 })

  const { productByHandle } = await shopifyAdminFetch<AdminProductResponse>({
    query: ADMIN_PRODUCT_QUERY,
    variables: { handle },
  })
  if (!productByHandle) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const numericId = productByHandle.id.split("/").pop()
  const price = productByHandle.variants.nodes[0]?.price

  return NextResponse.json({
    numericId,
    title: productByHandle.title,
    descriptionHtml: productByHandle.descriptionHtml,
    price,
  })
}
```

### POST /api/products

Creates a product and optionally attaches an image.

```typescript
export async function POST(request: Request) {
  const { title, descriptionHtml, variants, imageUrl } = await request.json()

  const result = await shopifyAdminFetch({ query: CREATE_PRODUCT_MUTATION, variables: { input: { title, descriptionHtml: descriptionHtml || "", status: "ACTIVE" } } })
  const product = result.productCreate.product

  // Optional: image upload via REST API
  if (imageUrl) {
    const numericId = product.id.split("/").pop()
    await fetch(`https://${domain}/admin/api/2024-10/products/${numericId}/images.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ image: { src: imageUrl } }),
    })
  }

  // Optional: set initial price
  const price = variants?.[0]?.price
  if (price) {
    const { product: p } = await shopifyAdminFetch({ query: PRODUCT_VARIANTS_QUERY, variables: { productId: product.id } })
    const variantId = p?.variants?.nodes?.[0]?.id
    if (variantId) {
      await shopifyAdminFetch({ query: UPDATE_VARIANT_MUTATION, variables: { productId: product.id, variants: [{ id: variantId, price: String(price) }] } })
    }
  }

  return NextResponse.json({ product }, { status: 201 })
}
```

> **Image upload**: Shopify's GraphQL Admin API has limited image support for mutations. Use the REST endpoint `/admin/api/{version}/products/{id}/images.json` instead.

### PUT /api/products/[id]

Updates title, description, and optionally the variant price.

```typescript
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const { title, descriptionHtml, price } = await request.json()
  const id = `gid://shopify/Product/${params.id}`

  // Update product metadata
  const { productUpdate } = await shopifyAdminFetch({ query: UPDATE_PRODUCT_MUTATION, variables: { input: { id, title, descriptionHtml: descriptionHtml || "" } } })

  // Update variant price if changed (only updates first variant)
  if (price !== undefined && price !== "") {
    const { product: existing } = await shopifyAdminFetch({ query: PRODUCT_VARIANTS_QUERY, variables: { productId: id } })
    const variantId = existing?.variants?.nodes?.[0]?.id
    if (variantId) {
      const varResult = await shopifyAdminFetch({ query: UPDATE_VARIANT_MUTATION, variables: { productId: id, variants: [{ id: variantId, price: String(price) }] } })
      if (varResult.productVariantsBulkUpdate.userErrors.length > 0) {
        return NextResponse.json({ error: varResult.productVariantsBulkUpdate.userErrors.map(e => e.message).join(", ") }, { status: 400 })
      }
    }
  }

  return NextResponse.json({ product: productUpdate.product })
}
```

### DELETE /api/products/[id]

```typescript
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const id = `gid://shopify/Product/${params.id}`
  const { productDelete } = await shopifyAdminFetch({ query: DELETE_PRODUCT_MUTATION, variables: { input: { id } } })
  if (productDelete.userErrors.length > 0) {
    return NextResponse.json({ error: productDelete.userErrors.map(e => e.message).join(", ") }, { status: 400 })
  }
  return NextResponse.json({ deleted: true })
}
```

---

## 7. TypeScript Types (`src/lib/types.ts`)

```typescript
export type ShopifyImage = {
  url: string
  altText: string | null
  width: number
  height: number
}

// Admin API product shape
export type AdminProduct = {
  id: string
  handle: string
  title: string
  descriptionHtml: string
  status: string
  featuredImage: ShopifyImage | null
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string }
    maxVariantPrice: { amount: string; currencyCode: string }
  }
  variants: {
    nodes: Array<{ id: string; title: string; price: string }>
  }
}

export type AdminProductsResponse = { products: { nodes: AdminProduct[] } }
export type AdminProductResponse = { productByHandle: AdminProduct | null }

export type ShopifyOrder = {
  id: string
  name: string
  createdAt: string
  processedAt: string | null
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  subtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  totalTaxSet: { shopMoney: { amount: string; currencyCode: string } }
  shippingAddress: { address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null } | null
  lineItems: {
    nodes: Array<{
      id: string; name: string; quantity: number
      originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } }
      product: { id: string } | null
    }>
  }
}

export type AdminOrdersResponse = { orders: { nodes: ShopifyOrder[] } }

export type UnifiedOrder = {
  id: string
  name: string
  createdAt: string
  total: { amount: string; currencyCode: string }
  status: string
  fulfillmentStatus: string | null
  shippingAddress: string | null
  lineItems: Array<{ id: string; name: string; quantity: number; total: string }>
  platform: "shopify" | "woocommerce"
}
```

---

## 8. Frontend Pages

All pages use `force-dynamic` to avoid serving stale data.

| Page                                         | Type              | Description                        |
|-----------------------------------------------|-------------------|------------------------------------|
| `/`                                           | Server Component  | Product grid + recent orders        |
| `/orders`                                     | Server Component  | Orders list (Shopify + WooCommerce) |
| `/products/[handle]`                          | Server Component  | Product detail, Edit/Delete buttons |
| `/products/add`                               | Client Component  | Form to create a product            |
| `/products/[handle]/edit`                     | Client Component  | Pre-filled edit form                |
| `/products/bulk`                              | Client Component  | Bulk product upload                 |

### Homepage (`src/app/page.tsx`)

The homepage fetches products from Shopify and recent orders from both Shopify and WooCommerce, displaying them in two sections.

```tsx
export const dynamic = "force-dynamic"

export default async function Home() {
  const [{ products }, { orders }] = await Promise.all([
    shopifyAdminFetch<AdminProductsResponse>({ query: ADMIN_PRODUCTS_QUERY }),
    shopifyAdminFetch<AdminOrdersResponse>({ query: ADMIN_ORDERS_QUERY, variables: { first: 6 } }),
  ])

  let wooOrders: WooCommerceOrder[] = []
  try { wooOrders = await fetchWooCommerceOrders(6) } catch { /* optional */ }

  const shopifyOrders = orders.nodes.map((o) => toUnifiedOrder(o, "shopify"))
  const wooUnified = wooOrders.map((o) => toUnifiedOrder(o, "woocommerce"))
  const allOrders = [...shopifyOrders, ...wooUnified].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Products</h1>
        <div className="flex gap-2">
          <Link href="/products/add"><Button>+ Add Product</Button></Link>
          <Link href="/products/bulk"><Button variant="outline">Bulk Upload</Button></Link>
          <Link href="/orders"><Button variant="outline">Orders</Button></Link>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.nodes.map(product => <ProductCard key={product.id} product={product} />)}
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-6">Recent Orders</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allOrders.map(order => <OrderCard key={`${order.platform}-${order.id}`} order={order} />)}
        </div>
      </div>
    </main>
  )
}
```

### Orders Page (`/orders`)

The orders page fetches up to 50 orders from both Shopify and WooCommerce, converts them to a unified format, merges and sorts by date descending, and displays them with platform badges. Tabs allow filtering by platform via URL search params (`?platform=shopify` or `?platform=woocommerce`).

```tsx
export default async function OrdersPage({ searchParams }: { searchParams: { platform?: string } }) {
  // Fetch from both platforms, merge, sort, filter by searchParams.platform
  // Render OrderCard with platform badge and expandable line items
}
```

See `src/app/orders/page.tsx` for the full implementation.

### Product Card (`src/components/ProductCard.tsx`)

```tsx
export default function ProductCard({ product }: { product: AdminProduct }) {
  const variantPrice = product.variants.nodes[0]?.price ?? "0"
  const currencyCode = product.priceRangeV2.minVariantPrice.currencyCode
  const formattedPrice = new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(Number(variantPrice))

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      {product.featuredImage && (
        <div className="aspect-square overflow-hidden">
          <img src={product.featuredImage.url} alt={product.featuredImage.altText ?? product.title} className="h-full w-full object-cover hover:scale-105 transition-transform" />
        </div>
      )}
      <CardContent className="p-4">
        <h2 className="text-lg font-semibold">{product.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{formattedPrice}</p>
      </CardContent>
    </Card>
  )
}
```

---

## 9. Known Pitfalls

### 9.1. `priceRangeV2` is stale after variant price update

Shopify's `priceRangeV2` (alias for `priceRange`) does **not** immediately reflect changes made via `productVariantsBulkUpdate`. Always read the price from `variants.nodes[0].price` for display.

```
// ❌ BAD — shows stale data
priceRangeV2.minVariantPrice.amount

// ✅ GOOD — shows actual variant price
variants.nodes[0]?.price
```

### 9.2. Admin API responses are cached by Next.js

Even with `export const dynamic = "force-dynamic"` on the page, `fetch` calls are cached. Always pass `cache: "no-store"` to the fetch options in your Admin API client.

### 9.3. New products don't appear in Storefront API

The Storefront API requires the API token to have the `write_publications` scope and the product must be published to a sales channel. Using the Admin API avoids this issue entirely.

### 9.4. Order fulfillment requires Fulfillment Orders API

The legacy REST endpoint `POST /orders/{id}/fulfillments.json` returns `406 Not Acceptable` in API version `2024-10` and later. Use the **Fulfillment Orders** workflow instead:

1. `GET /orders/{id}/fulfillment_orders.json` — get fulfillment orders with line items that have `fulfillable_quantity`
2. `POST /fulfillments.json` — create the fulfillment using `line_items_by_fulfillment_order`

See `updateShopifyFulfillment()` in `src/lib/shopify-admin.ts` for the implementation.

> **Required scopes**: `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`, `read_assigned_fulfillment_orders`, `write_assigned_fulfillment_orders` must be added to the Admin API token. Without these scopes, `fulfillmentOrders` silently returns an empty array.

### 9.5. Image upload requires REST, not GraphQL

The GraphQL Admin API mutation `productCreateMedia` is unreliable for initial product creation. Use the REST endpoint:

```
POST /admin/api/{version}/products/{id}/images.json
Body: { "image": { "src": "https://..." } }
```

---

## 10. Running the App

```bash
npm run dev       # Development — http://localhost:3000
npm run build     # Production build
npm start         # Serve production build
```

---

## 11. Quick Reference

- [Shopify Admin API GraphQL reference](https://shopify.dev/docs/api/admin-graphql)
- [Shopify Storefront API GraphQL reference](https://shopify.dev/docs/api/storefront-graphql)
- [shadcn/ui components](https://ui.shadcn.com/docs/components)
- GraphQL endpoint formats:
  - Storefront: `https://{domain}/api/{version}/graphql.json`
  - Admin: `https://{domain}/admin/api/{version}/graphql.json`

---

## 12. Order Status Update

This project supports updating a Shopify order's fulfillment status directly from the UI via the **Fulfillment Dropdown** on the Orders page and Homepage.

> **Important**: Shopify's fulfillment model uses the **Fulfillment Orders API** (not the legacy REST `/fulfillments.json`). The legacy endpoint returns `406 Not Acceptable` in API version `2024-10` and later.

---

### 12.1 Required API Scopes

Ensure the following scopes are enabled on your Admin API token:

| Scope | Purpose |
|---|---|
| `read_orders` | Query orders and their fulfillment orders |
| `read_merchant_managed_fulfillment_orders` | Read fulfillment orders for merchant-managed locations |
| `write_merchant_managed_fulfillment_orders` | Create fulfillments via `fulfillmentCreate` |
| `read_assigned_fulfillment_orders` | Read fulfillment orders assigned to your app |
| `write_assigned_fulfillment_orders` | Create fulfillments for orders assigned to your app |
| `read_locations` | Query shop locations (used in Draft Order fallback) |
| `read_content` | Query shop info |

In Shopify Admin: **Apps → Develop apps → [Your App] → Configuration → Admin API access scopes**.

> **Critical**: Without `read_merchant_managed_fulfillment_orders` and `write_merchant_managed_fulfillment_orders`, the GraphQL `fulfillmentOrders` query silently returns an empty array instead of throwing an error. This makes it impossible to create fulfillments.

---

### 12.2 How Shopify Fulfillment Works (Two-Step Flow)

Unlike WooCommerce (simple status field), marking a Shopify order as fulfilled requires two API calls:

```
Step 1 — Query fulfillment orders:
  GraphQL: order(id: "gid://shopify/Order/{id}") → fulfillmentOrders → nodes

Step 2 — Create a fulfillment:
  mutation fulfillmentCreate(fulfillment: { lineItemsByFulfillmentOrder: [...] })
```

**Only `FULFILLED` triggers actual API calls.** `UNFULFILLED` and `IN_PROGRESS` return immediately without calling Shopify (Shopify has no direct "un-fulfill" mutation).

#### Draft Order Fallback

Orders created from Shopify Draft Orders often have **no fulfillment orders** via GraphQL. The code handles this with a two-pass approach:

1. **Pass 1**: Query GraphQL `fulfillmentOrders` (works for standard checkout orders)
2. **Pass 2** (fallback): Query REST `GET /orders/{id}/fulfillment_orders.json`, then create the fulfillment via REST `POST /fulfillments.json` using the new `line_items_by_fulfillment_order` format

The REST fallback is required because:
- The legacy `POST /orders/{id}/fulfillments.json` with `line_items` returns `406 Not Acceptable`
- The new `POST /fulfillments.json` requires `line_items_by_fulfillment_order` with `fulfillment_order_id` values
- Draft Orders may not have fulfillment orders visible via GraphQL due to scope restrictions

---

### 12.3 GraphQL Queries & Mutations (`src/lib/shopify-admin.ts`)

#### Step 1 — Fetch Fulfillment Orders

```graphql
query GetFulfillmentOrders($orderId: ID!) {
  order(id: $orderId) {
    id
    fulfillmentOrders(first: 10) {
      nodes {
        id
        lineItems(first: 50) {
          nodes {
            id
            lineItem {
              id
              quantity
              fulfillableQuantity   # only items with > 0 can be fulfilled
            }
          }
        }
      }
    }
  }
}
```

#### Step 2 — Create Fulfillment

```graphql
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
```

Variables sent:

```json
{
  "fulfillment": {
    "notifyCustomer": false,
    "lineItemsByFulfillmentOrder": [
      {
        "fulfillmentOrderId": "gid://shopify/FulfillmentOrder/123"
      }
    ]
  }
}
```

> **Note**: Omitting `fulfillmentOrderLineItems` fulfills **all** fulfillable items on the fulfillment order. This avoids the `lineItemId` vs `id` field naming issue with `FulfillmentOrderLineItemInput`.

---

### 12.4 Library Function (`src/lib/shopify-admin.ts`)

```typescript
export async function updateShopifyFulfillment(
  orderId: string,          // Shopify GID string, e.g. "gid://shopify/Order/123" OR numeric string "123"
  fulfillmentStatus: string // "UNFULFILLED" | "IN_PROGRESS" | "FULFILLED"
): Promise<{ success: boolean; status: string }>
```

#### Status Behaviour

| Unified Status | Shopify Action | Returns |
|---|---|---|
| `UNFULFILLED` | Cancels all active fulfillments via `fulfillmentCancel` GraphQL mutation | `{ success: true, status: "UNFULFILLED" }` |
| `IN_PROGRESS` | **No API call** — display-only status | `{ success: true, status: "IN_PROGRESS" }` |
| `FULFILLED` | Fetches fulfillment orders → creates fulfillment via GraphQL. Falls back to REST for Draft Orders. | `{ success: true, status: "FULFILLED" }` |

#### Fulfillable Item Filtering

Before creating a fulfillment the function filters out:
- Fulfillment orders with **no fulfillable line items** (`fulfillableQuantity === 0`)
- If all line items are already fulfilled, the function returns `{ success: true, status: "FULFILLED" }` without calling the mutation

#### Error Handling

```typescript
if (result.fulfillmentCreate.userErrors?.length) {
  throw new Error(
    `Shopify fulfillment error: ${result.fulfillmentCreate.userErrors.map((e) => e.message).join("; ")}`
  )
}
```

---

### 12.5 API Route (`src/app/api/orders/[id]/route.ts`)

The `PATCH /api/orders/:id` endpoint is shared across all platforms.

#### Request

```http
PATCH /api/orders/gid://shopify/Order/123
Content-Type: application/json

{
  "platform": "shopify",
  "fulfillmentStatus": "FULFILLED"
}
```

> **Note**: For Shopify, the `id` in the URL path is passed directly to `updateShopifyFulfillment` as a string. The function builds the GID internally: the API route passes `params.id` (the raw URL segment) and the library prepends `gid://shopify/Order/` when querying.

#### Validation (same as other platforms)

| Rule | Error |
|------|-------|
| `platform` or `fulfillmentStatus` missing | `400 platform and fulfillmentStatus are required` |
| `fulfillmentStatus` not in `["UNFULFILLED", "IN_PROGRESS", "FULFILLED"]` | `400 fulfillmentStatus must be UNFULFILLED, IN_PROGRESS, or FULFILLED` |

#### Response

```json
{ "success": true, "status": "FULFILLED" }
```

---

### 12.6 Frontend — FulfillmentDropdown (`src/components/FulfillmentDropdown.tsx`)

The `<FulfillmentDropdown>` component is shared across all platforms (Shopify, WooCommerce, Odoo).

#### Props (Shopify-specific notes)

| Prop            | Type      | For Shopify                                           |
|-----------------|-----------|-------------------------------------------------------|
| `orderId`       | `string`  | The Shopify order GID or numeric ID from the URL      |
| `platform`      | `string`  | `"shopify"`                                           |
| `currentStatus` | `string \| null` | `displayFulfillmentStatus` from the GraphQL query |
| `onStatusChange`| `function`| Optional callback after successful update             |

#### Status Options & Display

| Value         | Label       | Badge Color              | Shopify Equivalent              |
|---------------|-------------|---------------------------|---------------------------------|
| `UNFULFILLED` | Unfulfilled | Yellow (`bg-yellow-100`) | `UNFULFILLED` (no fulfillment)  |
| `IN_PROGRESS` | In Progress | Blue (`bg-blue-100`)     | `IN_PROGRESS` (partial)         |
| `FULFILLED`   | Fulfilled   | Green (`bg-green-100`)   | `FULFILLED` (all items shipped) |

#### Optimistic UI

1. Dropdown updates immediately to the selected value.
2. `PATCH /api/orders/:id` fires in the background.
3. On failure → dropdown reverts, inline error shown.
4. On success → `onStatusChange` callback fires (if provided).
5. Dropdown is disabled while the request is in-flight.

---

### 12.7 Known Limitations

#### Only supports marking as FULFILLED

`UNFULFILLED` and `IN_PROGRESS` are **no-ops** in Shopify — the function returns success without making any API call. Shopify does not expose a mutation to un-fulfill or partially revert a fulfillment.

#### notifyCustomer is false

Fulfillments are created with `notifyCustomer: false` by default. To send shipping notifications, update the `fulfillmentCreate` variables in `updateShopifyFulfillment()`.

#### No tracking number support

The current implementation does not attach a tracking number or carrier to the fulfillment. Extend the `FulfillmentInput` with `trackingInfo` if needed.

---

### 12.8 Testing the Status Update

#### Via the UI

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000/orders`
3. Find a Shopify order row (look for the **Shopify** badge)
4. Click the fulfillment status dropdown and select **Fulfilled**
5. Verify the badge turns green; confirm in Shopify Admin under **Orders** that the fulfillment was created

#### Direct API Test (cURL)

```bash
# Replace ORDER_ID with the numeric Shopify order ID (e.g. 5678)
curl -X PATCH http://localhost:3000/api/orders/5678 \
  -H "Content-Type: application/json" \
  -d '{"platform":"shopify","fulfillmentStatus":"FULFILLED"}'
```

Expected response:

```json
{ "success": true, "status": "FULFILLED" }
```

#### Verify in Shopify Admin

Go to **Orders → [Order name] → Fulfillments** — a new fulfillment entry should appear with status **Success**.

---

### 12.9 Error Scenarios

| Scenario | Behaviour |
|---|---|
| Missing `read_merchant_managed_fulfillment_orders` scope | GraphQL `fulfillmentOrders` silently returns empty array → falls back to REST |
| Missing `write_merchant_managed_fulfillment_orders` scope | `userErrors: [{ message: "Access denied" }]` → `500` from API route |
| Legacy REST `POST /orders/{id}/fulfillments.json` | Returns `406 Not Acceptable` on API `2024-10`+ |
| Draft Order with no fulfillment orders | REST fallback queries `GET /orders/{id}/fulfillment_orders.json` → creates fulfillment via `POST /fulfillments.json` |
| All line items already fulfilled | Function returns `{ success: true, status: "FULFILLED" }` (idempotent) |
| Order not found | `order` is `null` → function returns `{ success: true, status: "FULFILLED" }` (safe fallback) |
| GraphQL `userErrors` present | `500` with `"Shopify fulfillment error: {message}"` |
| Network failure | Dropdown reverts; inline error shown to user |
