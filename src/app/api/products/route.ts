import { NextResponse } from "next/server"
import {
  shopifyAdminFetch,
  CREATE_PRODUCT_MUTATION,
  UPDATE_VARIANT_MUTATION,
  PRODUCT_VARIANTS_QUERY,
  ADMIN_PRODUCT_QUERY,
} from "@/lib/shopify-admin"
import { createProductOnOdoo, searchProductsOnOdoo } from "@/lib/odoo"
import { createProductOnWooCommerce } from "@/lib/woocommerce"
import type { AdminProductResponse } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get("handle")

  if (!handle) {
    return NextResponse.json(
      { error: "handle query param required" },
      { status: 400 }
    )
  }

  try {
    const { productByHandle } =
      await shopifyAdminFetch<AdminProductResponse>({
        query: ADMIN_PRODUCT_QUERY,
        variables: { handle },
      })

    if (!productByHandle) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const numericId = productByHandle.id.split("/").pop()
    const price = productByHandle.variants.nodes[0]?.price

    let odooProductId: number | null = null
    try {
      const matches = await searchProductsOnOdoo(productByHandle.title)
      if (matches.length > 0) {
        odooProductId = matches[0].id
      }
    } catch {
      // Odoo lookup is non-fatal
    }

    return NextResponse.json({
      numericId,
      title: productByHandle.title,
      descriptionHtml: productByHandle.descriptionHtml,
      price,
      odooProductId,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function createShopifyProduct(data: {
  title: string
  descriptionHtml?: string
  price?: string
  imageUrl?: string
  imageAlt?: string
}) {
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
      console.warn(`Image upload failed: ${errBody.slice(0, 200)}`)
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
          `Price update failed: ${productVariantsBulkUpdate.userErrors.map((e) => e.message).join(", ")}`
        )
      }
    }
  }

  return { id: product.id, title: product.title, handle: product.handle }
}

export async function POST(request: Request) {
  try {
    const { title, descriptionHtml, variants, imageUrl, imageAlt } =
      await request.json()

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      )
    }

    const data = {
      title,
      descriptionHtml,
      price: variants?.[0]?.price,
      imageUrl,
      imageAlt,
    }

    const results: Record<string, { success: boolean; product?: Record<string, unknown>; error?: string }> = {}

    const platforms = [
      { name: "shopify", fn: () => createShopifyProduct(data) },
      { name: "woocommerce", fn: () => createProductOnWooCommerce(data) },
      { name: "odoo", fn: () => createProductOnOdoo(data) },
    ]

    for (const { name, fn } of platforms) {
      try {
        const product = await fn()
        results[name] = { success: true, product }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong"
        results[name] = { success: false, error: message }
      }
    }

    return NextResponse.json({ results }, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
