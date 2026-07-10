export type ShopifyImage = {
  url: string
  altText: string | null
  width: number
  height: number
}

export type ShopifyProduct = {
  id: string
  handle: string
  title: string
  description: string
  availableForSale: boolean
  featuredImage: ShopifyImage | null
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string }
    maxVariantPrice: { amount: string; currencyCode: string }
  }
  variants: {
    nodes: Array<{
      id: string
      title: string
      availableForSale: boolean
      price: { amount: string; currencyCode: string }
    }>
  }
}

export type ShopifyProductsResponse = {
  products: {
    nodes: ShopifyProduct[]
  }
}

export type ShopifyProductResponse = {
  product: ShopifyProduct | null
}

// Admin API types (slightly different field names)
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
    nodes: Array<{
      id: string
      title: string
      price: string
    }>
  }
}

export type AdminProductsResponse = {
  products: {
    nodes: AdminProduct[]
  }
}

export type AdminProductResponse = {
  productByHandle: AdminProduct | null
}

export type ShopifyOrder = {
  id: string
  name: string
  createdAt: string
  processedAt: string | null
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  totalPriceSet: {
    shopMoney: { amount: string; currencyCode: string }
  }
  subtotalPriceSet: {
    shopMoney: { amount: string; currencyCode: string }
  }
  totalTaxSet: {
    shopMoney: { amount: string; currencyCode: string }
  }
  shippingAddress: {
    address1: string | null
    address2: string | null
    city: string | null
    province: string | null
    zip: string | null
    country: string | null
  } | null
  lineItems: {
    nodes: Array<{
      id: string
      name: string
      quantity: number
      originalUnitPriceSet: {
        shopMoney: { amount: string; currencyCode: string }
      }
      product: { id: string } | null
    }>
  }
}

export type AdminOrdersResponse = {
  orders: {
    nodes: ShopifyOrder[]
  }
}

export type WooCommerceOrder = {
  id: number
  number: string
  status: string
  date_created: string
  total: string
  currency: string
  billing: {
    first_name: string
    last_name: string
    address_1: string | null
    city: string
    state: string
    postcode: string
    country: string
  }
  shipping: {
    first_name: string
    last_name: string
    address_1: string | null
    city: string
    state: string
    postcode: string
    country: string
  }
  line_items: Array<{
    id: number
    name: string
    quantity: number
    total: string
    price: number
  }>
}

export type OdooOrder = {
  id: number
  name: string
  state: string
  date_order: string
  amount_total: number
  amount_untaxed: number
  currency_id: [number, string]
  partner_id: [number, string] | false
  partner_shipping_id: [number, string] | false
  order_line: Array<number[]>
}

export type OdooOrderLine = {
  id: number
  name: string
  product_uom_qty: number
  price_unit: number
  price_subtotal: number
}

export type UnifiedOrder = {
  id: string
  name: string
  createdAt: string
  total: { amount: string; currencyCode: string }
  status: string
  fulfillmentStatus: string | null
  shippingAddress: string | null
  lineItems: Array<{ id: string; name: string; quantity: number; total: string }>
  platform: "shopify" | "woocommerce" | "odoo"
}
