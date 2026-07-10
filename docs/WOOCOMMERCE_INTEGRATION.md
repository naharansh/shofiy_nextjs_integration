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

### Order Status Mapping

| WooCommerce Status | Unified Status     |
|--------------------|--------------------|
| `processing`       | `PENDING`          |
| `completed`        | `PAID` / `FULFILLED` |
| `on-hold`          | `ON-HOLD`          |
| `cancelled`        | `CANCELLED`        |

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
