import { NextResponse } from "next/server"
import {
  shopifyAdminFetch,
  CREATE_PRODUCT_MUTATION,
  UPDATE_VARIANT_MUTATION,
  PRODUCT_VARIANTS_QUERY,
} from "@/lib/shopify-admin"
import { createProductOnOdoo } from "@/lib/odoo"
import { createProductOnWooCommerce } from "@/lib/woocommerce"

type BulkProduct = {
  title: string
  descriptionHtml?: string
  price?: string
  imageUrl?: string
  imageAlt?: string
}

type PlatformResult = {
  success: boolean
  product?: Record<string, unknown>
  error?: string
}

type BulkResult = {
  index: number
  title: string
  results: Record<string, PlatformResult>
}

async function createShopifyProduct(data: BulkProduct) {
  const input: Record<string, unknown> = {
    title: data.title,
    descriptionHtml: data.descriptionHtml || "",
    status: "ACTIVE",
  }

  const result = await shopifyAdminFetch<{
    productCreate: {
      product: { id: string; title: string; handle: string } | null
      userErrors: Array<{ field: string; message: string }>
    }
  }>({
    query: CREATE_PRODUCT_MUTATION,
    variables: { input },
  })

  const { productCreate } = result

  if (productCreate.userErrors.length > 0) {
    throw new Error(productCreate.userErrors.map((e) => e.message).join(", "))
  }

  const product = productCreate.product!

  if (data.imageUrl) {
    const numericId = product.id.split("/").pop()
    const domain = process.env.SHOPIFY_STORE_DOMAIN
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
    const imgUrl = `https://${domain}/admin/api/2024-10/products/${numericId}/images.json`

    const imgRes = await fetch(imgUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token!,
      },
      body: JSON.stringify({
        image: { src: data.imageUrl, alt: data.imageAlt || data.title },
      }),
    })

    if (!imgRes.ok) {
      const errBody = await imgRes.text()
      console.warn(`Image upload failed for ${data.title}: ${errBody.slice(0, 200)}`)
    }
  }

  if (data.price) {
    const { product: existing } = await shopifyAdminFetch<{
      product: {
        variants: { nodes: Array<{ id: string }> }
      }
    }>({
      query: PRODUCT_VARIANTS_QUERY,
      variables: { productId: product.id },
    })

    const variantId = existing?.variants?.nodes?.[0]?.id

    if (variantId) {
      const updateResult = await shopifyAdminFetch<{
        productVariantsBulkUpdate: {
          productVariants: Array<{ id: string }>
          userErrors: Array<{ field: string; message: string }>
        }
      }>({
        query: UPDATE_VARIANT_MUTATION,
        variables: {
          productId: product.id,
          variants: [{ id: variantId, price: String(data.price) }],
        },
      })

      const { productVariantsBulkUpdate } = updateResult

      if (productVariantsBulkUpdate.userErrors.length > 0) {
        console.warn(
          `Price update failed for ${data.title}: ${productVariantsBulkUpdate.userErrors.map((e) => e.message).join(", ")}`
        )
      }
    }
  }

  return { id: product.id, title: product.title, handle: product.handle }
}

async function createOnAllPlatforms(data: BulkProduct) {
  const platformFns = [
    { name: "shopify", fn: () => createShopifyProduct(data) },
    { name: "woocommerce", fn: () => createProductOnWooCommerce(data) },
    { name: "odoo", fn: () => createProductOnOdoo(data) },
  ]

  const results: Record<string, PlatformResult> = {}

  for (const { name, fn } of platformFns) {
    try {
      const product = await fn()
      results[name] = { success: true, product }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong"
      results[name] = { success: false, error: message }
    }
  }

  return results
}

export async function POST(request: Request) {
  try {
    const { products } = await request.json()

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: "products must be a non-empty array" },
        { status: 400 }
      )
    }

    if (products.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 products per bulk upload" },
        { status: 400 }
      )
    }

    for (let i = 0; i < products.length; i++) {
      if (!products[i].title) {
        return NextResponse.json(
          { error: `Product at index ${i} is missing title` },
          { status: 400 }
        )
      }
    }

    const results: BulkResult[] = []

    for (let i = 0; i < products.length; i++) {
      const data = products[i] as BulkProduct
      const perPlatform = await createOnAllPlatforms(data)
      results.push({ index: i, title: data.title, results: perPlatform })
    }

    const total = products.length * 3
    const succeeded = results.reduce(
      (acc, r) => acc + Object.values(r.results).filter((v) => v.success).length,
      0
    )
    const failed = total - succeeded

    return NextResponse.json({
      results,
      summary: { total, succeeded, failed },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
