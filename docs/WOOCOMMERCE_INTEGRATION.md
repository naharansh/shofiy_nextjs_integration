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

## 8. Known Limitations

### 8.1. Product listing only shows Shopify products

The homepage (`/`) fetches products from Shopify's Admin API. WooCommerce-created products do not appear in the grid. View them in WordPress admin at **WooCommerce → Products**.

### 8.2. Simple products only

This integration creates `type: "simple"` products. Variable products, grouped products, or external products are not supported.

### 8.3. No category or tag mapping

Categories and tags are not set during creation. You can extend `createProductOnWooCommerce` to accept category IDs or tag IDs if needed.

### 8.4. Image URL must be publicly accessible

WooCommerce fetches the image from the provided `src` URL server-side. The URL must be reachable from the WordPress installation.

---

## 9. Testing the Integration

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

## 10. WooCommerce REST API Reference

| Method   | Endpoint                              | Description          |
|----------|---------------------------------------|----------------------|
| `GET`    | `/wp-json/wc/v3/products`             | List products        |
| `POST`   | `/wp-json/wc/v3/products`             | Create product       |
| `GET`    | `/wp-json/wc/v3/products/{id}`        | Get single product   |
| `PUT`    | `/wp-json/wc/v3/products/{id}`        | Update product       |
| `DELETE` | `/wp-json/wc/v3/products/{id}`        | Delete product       |

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

## 11. Quick Reference

- [WooCommerce REST API documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- WooCommerce REST API endpoint: `{WOOCOMMERCE_URL}/wp-json/wc/v3/`
- Authentication: Basic Auth (Consumer Key : Consumer Secret)
- Default product type: `simple`
- Default status: `publish`
