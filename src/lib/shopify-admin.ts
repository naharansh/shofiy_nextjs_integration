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
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Shopify Admin API error: ${res.status} ${res.statusText}`)
  }

  const body: ShopifyAdminResponse<T> = await res.json()

  if ("errors" in (body as any)) {
    throw new Error(
      `Shopify Admin API error: ${JSON.stringify((body as any).errors)}`
    )
  }

  return body.data
}

export const CREATE_PRODUCT_MUTATION = `#graphql
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const UPDATE_VARIANT_MUTATION = `#graphql
  mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const PRODUCT_VARIANTS_QUERY = `#graphql
  query ProductVariants($productId: ID!) {
    product(id: $productId) {
      variants(first: 1) {
        nodes {
          id
          price
        }
      }
    }
  }
`

export const UPDATE_PRODUCT_MUTATION = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
        descriptionHtml
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const DELETE_PRODUCT_MUTATION = `#graphql
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`

export const ADD_IMAGE_MUTATION = `#graphql
  mutation AddImage($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const ADMIN_PRODUCTS_QUERY = `#graphql
  query AdminProducts {
    products(first: 50, query: "status:ACTIVE") {
      nodes {
        id
        handle
        title
        descriptionHtml
        status
        featuredImage {
          url
          altText
          width
          height
        }
        priceRangeV2: priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 1) {
          nodes {
            id
            title
            price
          }
        }
      }
    }
  }
`

export const ADMIN_PRODUCT_QUERY = `#graphql
  query AdminProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      descriptionHtml
      status
      featuredImage {
        url
        altText
        width
        height
      }
      priceRangeV2: priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 50) {
        nodes {
          id
          title
          price
        }
      }
    }
  }
`

export const ADMIN_ORDERS_QUERY = `#graphql
  query AdminOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        shippingAddress {
          address1
          address2
          city
          province
          zip
          country
        }
        lineItems(first: 20) {
          nodes {
            id
            name
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`
