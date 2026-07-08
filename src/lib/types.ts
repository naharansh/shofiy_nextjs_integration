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
