import { NextResponse } from "next/server"
import {
  shopifyAdminFetch,
  UPDATE_PRODUCT_MUTATION,
  DELETE_PRODUCT_MUTATION,
  UPDATE_VARIANT_MUTATION,
  PRODUCT_VARIANTS_QUERY,
} from "@/lib/shopify-admin"

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { title, descriptionHtml, price } = await request.json()
    const id = `gid://shopify/Product/${params.id}`

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      )
    }

    const result = await shopifyAdminFetch<{
      productUpdate: {
        product: { id: string; title: string; handle: string } | null
        userErrors: Array<{ field: string; message: string }>
      }
    }>({
      query: UPDATE_PRODUCT_MUTATION,
      variables: {
        input: {
          id,
          title,
          descriptionHtml: descriptionHtml || "",
        },
      },
    })

    const { productUpdate } = result

    if (productUpdate.userErrors.length > 0) {
      return NextResponse.json(
        { error: productUpdate.userErrors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }

    if (price !== undefined && price !== "") {
      const { product: existing } = await shopifyAdminFetch<{
        product: {
          variants: { nodes: Array<{ id: string; price: string }> }
        }
      }>({
        query: PRODUCT_VARIANTS_QUERY,
        variables: { productId: id },
      })

      const variantId = existing?.variants?.nodes?.[0]?.id

      if (variantId && String(existing.variants.nodes[0].price) !== String(price)) {
        const varResult = await shopifyAdminFetch<{
          productVariantsBulkUpdate: {
            userErrors: Array<{ field: string; message: string }>
          }
        }>({
          query: UPDATE_VARIANT_MUTATION,
          variables: {
            productId: id,
            variants: [{ id: variantId, price: String(price) }],
          },
        })

        if (varResult.productVariantsBulkUpdate.userErrors.length > 0) {
          return NextResponse.json(
            {
              error: varResult.productVariantsBulkUpdate.userErrors
                .map((e) => e.message)
                .join(", "),
            },
            { status: 400 }
          )
        }
      }
    }

    return NextResponse.json({ product: productUpdate.product })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = `gid://shopify/Product/${params.id}`

    const result = await shopifyAdminFetch<{
      productDelete: {
        deletedProductId: string
        userErrors: Array<{ field: string; message: string }>
      }
    }>({
      query: DELETE_PRODUCT_MUTATION,
      variables: { input: { id } },
    })

    const { productDelete } = result

    if (productDelete.userErrors.length > 0) {
      return NextResponse.json(
        { error: productDelete.userErrors.map((e) => e.message).join(", ") },
        { status: 400 }
      )
    }

    return NextResponse.json({ deleted: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
