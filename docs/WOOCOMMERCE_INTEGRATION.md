# WooCommerce + Next.js Integration Guide

This guide covers integrating WooCommerce's REST API into a Next.js 14 App Router project for product creation alongside Shopify and Odoo.

---

## 1. Prerequisites

- **Node.js** 18+ and **npm**
- A **WordPress site** with **WooCommerce** installed and activated
- **WooCommerce REST API keys** (Consumer Key and Consumer Secret) with read/write permissions

---

## 2. Environment Variables

Add to `.env.local`:

```
WOOCOMMERCE_URL=http://localhost/wordpress
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Variable                   | Description                                      |
|----------------------------|--------------------------------------------------|
| `WOOCOMMERCE_URL`          | Base URL of the WordPress installation           |
| `WOOCOMMERCE_CONSUMER_KEY` | WooCommerce REST API consumer key                |
| `WOOCOMMERCE_CONSUMER_SECRET` | WooCommerce REST API consumer secret          |

### Generating API Keys

1. In WordPress admin, go to **WooCommerce → Settings → Advanced → REST API**
2. Click **Add Key**
3. Set **Description** (e.g. "Next.js integration")
4. Set **Permissions** to **Read/Write**
5. Click **Generate API Key**
6. Copy the **Consumer Key** and **Consumer Secret**

---

## 3. WooCommerce Client (`src/lib/woocommerce.ts`)

The client uses WooCommerce's standard REST API v3 with Basic Auth.

### API Endpoint

```
POST {WOOCOMMERCE_URL}/wp-json/wc/v3/products
```

### Authentication

Basic Auth with the Consumer Key as username and Consumer Secret as password:

```typescript
const token = btoa(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`)
// Authorization: Basic base64(consumer_key:consumer_secret)
```

### Creating a Product

```typescript
const body = {
  name: "Product Title",
  type: "simple",
  status: "publish",
  description: "<p>Product description</p>",
  regular_price: "29.99",
  images: [{ src: "https://example.com/image.jpg", alt: "Product image" }],
}
```

### Response

```json
{
  "id": 123,
  "name": "Product Title",
  "permalink": "http://localhost/wordpress/product/product-title/",
  ...
}
```

---

## 4. API Route Integration (`src/app/api/products/route.ts`)

The existing `POST /api/products` endpoint accepts `platform: "woocommerce"` in the request body.

### Request Body

```json
{
  "title": "Product Name",
  "descriptionHtml": "<p>Description</p>",
  "variants": [{ "price": "29.99" }],
  "imageUrl": "https://example.com/image.jpg",
  "imageAlt": "Product image",
  "platform": "woocommerce"
}
```

### Routing Logic

```typescript
if (platform === "woocommerce") {
  const product = await createProductOnWooCommerce({
    title,
    descriptionHtml,
    price: variants?.[0]?.price,
    imageUrl,
    imageAlt,
  })
  return NextResponse.json({ product }, { status: 201 })
}
```

| `platform` value   | Behavior                                            |
|--------------------|-----------------------------------------------------|
| `"shopify"`        | Creates product via Shopify Admin API (default)      |
| `"woocommerce"`    | Creates product via WooCommerce REST API             |
| `"odoo"`           | Creates product via Odoo XML-RPC API                 |

---

## 5. Frontend — Platform Selector

The Add Product page (`src/app/products/add/page.tsx`) includes three platform options:

```
┌──────────────────────────────────────┐
│  Platform                            │
│  ┌──────────┐ ┌────────────┐ ┌──────┐│
│  │ Shopify  │ │ WooCommerce │ │ Odoo ││
│  └──────────┘ └────────────┘ └──────┘│
│                                      │
│  ...                                 │
│  ┌──────────────────────────────┐    │
│  │    Create on WooCommerce     │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

---

## 6. Mapped WooCommerce Fields

| Form Field            | WooCommerce Field    | Notes                         |
|-----------------------|----------------------|-------------------------------|
| Title                 | `name`               | Required                      |
| Description (HTML)    | `description`        | Product description           |
| Price                 | `regular_price`      | Simple product price          |
| Image URL             | `images[0].src`      | Image source URL              |
| Image Alt             | `images[0].alt`      | Image alt text                |

Additional hardcoded values:

| WooCommerce Field | Value     | Purpose              |
|-------------------|-----------|----------------------|
| `type`            | `simple`  | Simple product       |
| `status`          | `publish` | Published immediately|

---

## 7. Error Handling

- **API errors**: WooCommerce returns detailed error messages in the response body, parsed and thrown as `"WooCommerce API error ({status}): {message}"`
- **Authentication failure**: Returns 401 with `"Invalid Consumer Key and/or Secret"` if credentials are wrong
- **Validation errors**: Returns 400 with the specific field validation message (e.g. "Missing parameter: name")

All errors are returned to the frontend as `{ error: "message" }` with the appropriate HTTP status code.

---

## 8. Orders (WooCommerce)

The project can fetch and display WooCommerce orders alongside Shopify orders.

### Fetching Orders

```typescript
import { fetchWooCommerceOrders } from "@/lib/woocommerce"

const orders = await fetchWooCommerceOrders(50)
```

The function calls `GET /wp-json/wc/v3/orders?per_page={limit}&orderby=date&order=desc` and returns an array of `WooCommerceOrder` objects.

### Order Type

```typescript
type WooCommerceOrder = {
  id: number
  number: string
  status: string
  date_created: string
  total: string
  currency: string
  billing: { first_name: string; last_name: string; address_1: string | null; city: string; state: string; postcode: string; country: string }
  shipping: { first_name: string; last_name: string; address_1: string | null; city: string; state: string; postcode: string; country: string }
  line_items: Array<{ id: number; name: string; quantity: number; total: string; price: number }>
}
```

### Order Status Mapping (Read)

When displaying orders, WooCommerce statuses are shown as-is in the UI. The `status` field on a `WooCommerceOrder` object maps to the following unified display values:

| WooCommerce Status | Display Label  | Badge Color  |
|--------------------|----------------|--------------|
| `processing`       | Unfulfilled    | Yellow       |
| `on-hold`          | In Progress    | Blue         |
| `completed`        | Fulfilled      | Green        |
| `cancelled`        | Cancelled      | Red          |
| `pending`          | Pending        | Grey         |
| `refunded`         | Refunded       | Purple       |

### Orders Page (`/orders`)

The orders page fetches from both Shopify and WooCommerce, converts each to a `UnifiedOrder`, sorts by date descending, and displays them with a platform badge. Three tabs allow filtering:

- **All** — shows orders from both platforms
- **Shopify** — only Shopify orders
- **WooCommerce** — only WooCommerce orders

Filtering uses URL search params (`?platform=shopify` or `?platform=woocommerce`).

### Homepage Integration

The homepage (`/`) shows the 6 most recent orders from each platform (sorted together by date). WooCommerce fetch errors on the homepage are silently caught so they don't block the product grid.

---

## 9. Known Limitations

### 9.1. Simple products only

This integration creates `type: "simple"` products. Variable products, grouped products, or external products are not supported.

### 9.2. No category or tag mapping

Categories and tags are not set during creation. You can extend `createProductOnWooCommerce` to accept category IDs or tag IDs if needed.

### 9.3. Image URL must be publicly accessible

WooCommerce fetches the image from the provided `src` URL server-side. The URL must be reachable from the WordPress installation.

---

## 10. Testing the Integration

### With a local WordPress/WooCommerce site

```bash
# Start the Next.js dev server
npm run dev
```

Visit `http://localhost:3000/products/add`, select **WooCommerce** as the platform, fill in the form, and submit.

### Verify in WordPress

Go to **WooCommerce → Products** in the WordPress admin to see the newly created product.

### Direct API test

```bash
curl -X POST {WOOCOMMERCE_URL}/wp-json/wc/v3/products \
  -u consumer_key:consumer_secret \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","type":"simple","regular_price":"9.99","status":"publish"}'
```

---

## 11. WooCommerce REST API Reference

| Method   | Endpoint                              | Description          |
|----------|---------------------------------------|----------------------|
| `GET`    | `/wp-json/wc/v3/products`             | List products        |
| `POST`   | `/wp-json/wc/v3/products`             | Create product       |
| `GET`    | `/wp-json/wc/v3/products/{id}`        | Get single product   |
| `PUT`    | `/wp-json/wc/v3/products/{id}`        | Update product       |
| `DELETE` | `/wp-json/wc/v3/products/{id}`        | Delete product       |
| `GET`    | `/wp-json/wc/v3/orders`               | List orders          |
| `GET`    | `/wp-json/wc/v3/orders/{id}`          | Get single order     |
| `PUT`    | `/wp-json/wc/v3/orders/{id}`          | Update order status  |

### Product fields commonly used

| Field            | Type   | Description                     |
|------------------|--------|---------------------------------|
| `name`           | string | Product name (required)         |
| `type`           | string | `simple`, `variable`, etc.      |
| `status`         | string | `draft`, `publish`, `pending`   |
| `regular_price`  | string | Regular price                   |
| `sale_price`     | string | Sale price                      |
| `description`    | string | Product description (HTML)      |
| `short_description` | string | Short description (HTML)      |
| `images`         | array  | Array of `{src, alt}` objects   |
| `categories`     | array  | Array of `{id}` objects         |
| `tags`           | array  | Array of `{id}` objects         |

---

## 12. Quick Reference

- [WooCommerce REST API documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- WooCommerce REST API endpoint: `{WOOCOMMERCE_URL}/wp-json/wc/v3/`
- Authentication: Basic Auth (Consumer Key : Consumer Secret)
- Default product type: `simple`
- Default status: `publish`

---

## 13. Order Status Update

This project supports updating a WooCommerce order's status directly from the UI via the **Fulfillment Dropdown** on the Orders page.

---

### 13.1 Library Function (`src/lib/woocommerce.ts`)

```typescript
export async function updateWooCommerceOrderStatus(
  orderId: number,
  fulfillmentStatus: string
): Promise<{ success: boolean; status: string }>
```

The function maps a unified fulfillment status to a WooCommerce-native status and calls the WooCommerce REST API:

```
PUT {WOOCOMMERCE_URL}/wp-json/wc/v3/orders/{orderId}
Authorization: Basic base64(consumer_key:consumer_secret)
Content-Type: application/json

{ "status": "<wc_status>" }
```

#### Status Mapping (Write)

| Unified Status (app)  | WooCommerce Status (API) | Meaning                        |
|-----------------------|--------------------------|--------------------------------|
| `UNFULFILLED`         | `processing`             | Order received, not shipped    |
| `IN_PROGRESS`         | `on-hold`                | Awaiting further action        |
| `FULFILLED`           | `completed`              | Shipped / delivered            |
| *(fallback)*          | `processing`             | Any unrecognized value         |

On success, the function returns:

```json
{ "success": true, "status": "COMPLETED" }
```

The `status` field in the response is the WooCommerce status returned by the API, uppercased.

---

### 13.2 API Route (`src/app/api/orders/[id]/route.ts`)

The `PATCH /api/orders/:id` endpoint handles status updates for all platforms.

#### Request

```http
PATCH /api/orders/456
Content-Type: application/json

{
  "platform": "woocommerce",
  "fulfillmentStatus": "FULFILLED"
}
```

#### Validation

| Rule | Error |
|------|-------|
| `platform` missing | `400 platform and fulfillmentStatus are required` |
| `fulfillmentStatus` missing | `400 platform and fulfillmentStatus are required` |
| `fulfillmentStatus` not in allowed set | `400 fulfillmentStatus must be UNFULFILLED, IN_PROGRESS, or FULFILLED` |
| Unknown platform | `400 Unsupported platform: <value>` |

#### Routing Logic

```typescript
if (platform === "shopify") {
  result = await updateShopifyFulfillment(params.id, fulfillmentStatus)
} else if (platform === "woocommerce") {
  result = await updateWooCommerceOrderStatus(Number(params.id), fulfillmentStatus)
} else if (platform === "odoo") {
  result = await updateOdooOrderStatus(Number(params.id), fulfillmentStatus)
}
```

#### Response

```json
{ "success": true, "status": "COMPLETED" }
```

---

### 13.3 Frontend — FulfillmentDropdown (`src/components/FulfillmentDropdown.tsx`)

The `<FulfillmentDropdown>` is a client component rendered inline in each order row on the Orders page and Homepage.

#### Props

| Prop            | Type                                    | Description                                  |
|-----------------|-----------------------------------------|----------------------------------------------|
| `orderId`       | `string`                                | WooCommerce order ID (numeric, as string)    |
| `platform`      | `"shopify" \| "woocommerce" \| "odoo"` | Controls which API path is used              |
| `currentStatus` | `string \| null`                        | Current WooCommerce status (e.g. `processing`)|
| `onStatusChange`| `(newStatus: string) => void` (optional)| Callback fired after a successful update     |

#### Available Status Options

| Value         | Label       | Badge Color              |
|---------------|-------------|---------------------------|
| `UNFULFILLED` | Unfulfilled | Yellow (`bg-yellow-100`) |
| `IN_PROGRESS` | In Progress | Blue (`bg-blue-100`)     |
| `FULFILLED`   | Fulfilled   | Green (`bg-green-100`)   |

#### Optimistic UI Behaviour

1. The dropdown updates immediately (optimistic update).
2. A `PATCH /api/orders/:id` request is sent in the background.
3. If the request fails, the dropdown reverts to the previous status and shows an inline error message.
4. While the request is in flight, the dropdown is disabled (`opacity-50`).

---

### 13.4 Error Handling

| Scenario                          | Behaviour                                                          |
|-----------------------------------|--------------------------------------------------------------------|
| WooCommerce returns non-2xx       | Error thrown: `"WooCommerce API error ({status}): {body}"`         |
| Invalid credentials               | WooCommerce returns `401`; error propagated to client              |
| Order not found                   | WooCommerce returns `404`; error propagated to client              |
| Unsupported `fulfillmentStatus`   | API route returns `400` before calling WooCommerce                 |
| Network failure                   | Dropdown reverts; inline error shown to user                       |

---

### 13.5 Testing the Status Update

#### Via the UI

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000/orders`
3. Find a WooCommerce order row (look for the **WooCommerce** badge)
4. Click the fulfillment status dropdown and select a new value
5. Verify the badge updates immediately; confirm in WooCommerce admin that the order status changed

#### Direct API Test (cURL)

```bash
curl -X PATCH http://localhost:3000/api/orders/456 \
  -H "Content-Type: application/json" \
  -d '{"platform":"woocommerce","fulfillmentStatus":"FULFILLED"}'
```

Expected response:

```json
{ "success": true, "status": "COMPLETED" }
```

#### Verify in WordPress

In WordPress admin, go to **WooCommerce → Orders** and confirm the order status changed to **Completed**.
