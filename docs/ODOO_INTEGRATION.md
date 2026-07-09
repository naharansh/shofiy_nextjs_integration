# Odoo + Next.js Integration Guide

This guide covers integrating Odoo's XML-RPC API into a Next.js 14 App Router project for product creation alongside the existing Shopify integration.

---

## 1. Prerequisites

- **Node.js** 18+ and **npm**
- An **Odoo instance** running (local or remote) with XML-RPC enabled (default on port 8069)
- Odoo user credentials with create/write access to `product.template`

---

## 2. Dependencies

The integration uses the [`xmlrpc`](https://www.npmjs.com/package/xmlrpc) npm package to communicate with Odoo's XML-RPC endpoints.

```bash
npm install xmlrpc
npm install -D @types/xmlrpc
```

---

## 3. Environment Variables

Add to `.env.local`:

```
ODOO_URL=http://localhost:8069
ODOO_DB=your-database-name
ODOO_USERNAME=your-email@example.com
ODOO_PASSWORD=your-password
```

| Variable         | Description                                    |
|------------------|------------------------------------------------|
| `ODOO_URL`       | Full URL of the Odoo instance (including port) |
| `ODOO_DB`        | Odoo database name                             |
| `ODOO_USERNAME`  | User email for XML-RPC authentication          |
| `ODOO_PASSWORD`  | User password for XML-RPC authentication       |

---

## 4. Odoo Client (`src/lib/odoo.ts`)

The client uses Odoo's standard XML-RPC endpoints:

| Endpoint                 | Purpose                          |
|--------------------------|----------------------------------|
| `/xmlrpc/2/common`       | Authentication & version info     |
| `/xmlrpc/2/object`       | Model CRUD operations             |

### Authentication Flow

```typescript
const uid = await methodCall<number>(client, "authenticate", [
  ODOO_DB,
  ODOO_USERNAME,
  ODOO_PASSWORD,
  {},
])
```

Returns a user ID (int). A failed authentication returns `0` or `false`. The UID is cached in-memory so subsequent requests within the same serverless function reuse it.

### Creating a Product

Products are created via `execute_kw` on the `product.template` model:

```typescript
const productId = await methodCall<number>(client, "execute_kw", [
  ODOO_DB,
  uid,
  ODOO_PASSWORD,
  "product.template",
  "create",
  [{
    name: "Product Title",
    type: "consu",
    sale_ok: true,
    purchase_ok: true,
    list_price: 19.99,
    description: "Product description (HTML supported)",
    description_sale: "Product description",
  }],
])
```

### Image Handling

If an image URL is provided, the client downloads the image, converts it to base64, and writes it to `product.template`'s `image_1920` field:

```typescript
const imgRes = await fetch(data.imageUrl)
const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
const base64 = imgBuffer.toString("base64")

await methodCall(client, "execute_kw", [
  ODOO_DB, uid, ODOO_PASSWORD,
  "product.template",
  "write",
  [[productId], { image_1920: base64 }],
])
```

> Image upload failures are non-fatal — the product is created without an image and a warning is logged.

---

## 5. API Route Integration (`src/app/api/products/route.ts`)

The existing `POST /api/products` endpoint accepts an optional `platform` field in the request body.

### Request Body

```json
{
  "title": "Product Name",
  "descriptionHtml": "<p>Description</p>",
  "variants": [{ "price": "29.99" }],
  "imageUrl": "https://example.com/image.jpg",
  "imageAlt": "Product image",
  "platform": "odoo"
}
```

### Routing Logic

```typescript
if (platform === "odoo") {
  const product = await createProductOnOdoo({ title, descriptionHtml, price, imageUrl, imageAlt })
  return NextResponse.json({ product }, { status: 201 })
}

// Otherwise, fall through to existing Shopify creation logic
```

| `platform` value | Behavior                                         |
|------------------|--------------------------------------------------|
| `"shopify"`      | Creates product via Shopify Admin API (default)   |
| `"odoo"`         | Creates product via Odoo XML-RPC                  |

---

## 6. Frontend — Platform Selector

The Add Product page (`src/app/products/add/page.tsx`) now includes a **Platform** toggle at the top of the form.

```
┌─────────────────────────────────────┐
│  Platform                           │
│  ┌──────────┐ ┌──────────┐          │
│  │ Shopify  │ │  Odoo    │          │
│  └──────────┘ └──────────┘          │
│                                     │
│  Title *                            │
│  [_____________________________]    │
│  ...                                │
│  ┌─────────────────────────────┐    │
│  │     Create on Odoo          │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

- Default selection: **Shopify** (backward-compatible)
- Submit button text changes dynamically: "Create on Shopify" / "Create on Odoo"
- The `platform` value is sent as part of the `POST /api/products` JSON body

---

## 7. Mapped Odoo Fields

| Form Field            | Odoo `product.template` Field | Notes                        |
|-----------------------|-------------------------------|------------------------------|
| Title                 | `name`                        | Required                     |
| Description (HTML)    | `description`                 | Sales description            |
| Description (HTML)    | `description_sale`            | Short description (duplicated)|
| Price                 | `list_price`                  | Parsed as Number              |
| Image URL             | `image_1920`                  | Downloaded & base64-encoded   |

Additional hardcoded values:

| Odoo Field      | Value  | Purpose                  |
|-----------------|--------|--------------------------|
| `type`          | `consu`| Consumable product type   |
| `sale_ok`       | `true` | Can be sold               |
| `purchase_ok`   | `true` | Can be purchased          |

---

## 8. Error Handling

- **Authentication failure**: Throws `"Odoo authentication failed – invalid credentials"` when UID is `0` or `null`
- **XML-RPC errors**: Wrapped as `"Odoo XML-RPC error: {message}"`
- **Image upload failure**: Warns via `console.warn` but does not fail the product creation

All errors are returned to the frontend as `{ error: "message" }` with the appropriate HTTP status code.

---

## 9. Known Limitations

### 9.1. Product listing only shows Shopify products

The homepage (`/`) fetches products from Shopify's Admin API. Odoo-created products do not appear in the grid. To view them, log into the Odoo backend directly.

### 9.2. No unified product ID

Shopify and Odoo use entirely different ID schemes (`gid://shopify/Product/...` vs integer IDs). There is no cross-reference table linking products across platforms.

### 9.3. Image upload requires outbound internet

The Odoo client downloads image URLs server-side via `fetch`. If the Odoo instance is on a private network, the image source URL must be reachable from the Next.js server.

### 9.4. Session UID is cached in memory

The authenticated UID is cached as a module-level variable. In serverless environments (Vercel, etc.), this cache may be per-instance and not persist across cold starts.

---

## 10. Testing the Integration

### With a local Odoo instance

```bash
# Ensure Odoo is running
docker ps  # or however Odoo is started

# Start the Next.js dev server
npm run dev
```

Then visit `http://localhost:3000/products/add`, select **Odoo** as the platform, fill in the form, and submit.

### Verify in Odoo

```bash
# Check the product was created
curl http://localhost:8069/xmlrpc/2/object \
  -H "Content-Type: text/xml" \
  -d '<methodCall><methodName>execute_kw</methodName>
    <params>
      <param><value><string>shopify</string></value></param>
      <param><value><int>1</int></value></param>
      <param><value><string>123</string></value></param>
      <param><value><string>product.template</string></value></param>
      <param><value><string>search_read</string></value></param>
      <param><value><array><data>
        <value><array><data>
          <value><array><data>
            <value><string>name</string></value>
            <value><string>list_price</string></value>
          </data></value>
        </data></array></value>
      </data></array></value></param>
    </params>
  </methodCall>'
```

---

## 11. Odoo XML-RPC API Reference

| Endpoint               | Common Methods                          |
|------------------------|------------------------------------------|
| `/xmlrpc/2/common`     | `version`, `authenticate`                |
| `/xmlrpc/2/object`     | `execute_kw`, `execute`                  |

### `execute_kw` parameters (in order)

1. **db** (string) — database name
2. **uid** (int) — authenticated user ID
3. **password** (string) — user password
4. **model** (string) — model name (e.g. `product.template`)
5. **method** (string) — method name (e.g. `create`, `write`, `search_read`)
6. **args** (array) — positional arguments
7. **kwargs** (object, optional) — keyword arguments

### Common `product.template` methods

| Method         | Args                              | Returns       |
|----------------|-----------------------------------|---------------|
| `create`       | `[fields_object]`                 | New record ID |
| `write`        | `[[ids], fields_object]`          | `true`        |
| `search_read`  | `[domain, [fields]]`              | Array of records |

---

## 12. Quick Reference

- [Odoo External API documentation](https://www.odoo.com/documentation/master/developer/reference/external_api.html)
- Odoo XML-RPC endpoints:
  - Common: `{ODOO_URL}/xmlrpc/2/common`
  - Object: `{ODOO_URL}/xmlrpc/2/object`
- Default Odoo port: **8069**
- Model for products: `product.template`
