import { NextResponse } from "next/server"
import { updateShopifyFulfillment } from "@/lib/shopify-admin"
import { updateWooCommerceOrderStatus } from "@/lib/woocommerce"
import { updateOdooOrderStatus } from "@/lib/odoo"

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { platform, fulfillmentStatus } = body as {
      platform: "shopify" | "woocommerce" | "odoo"
      fulfillmentStatus: string
    }

    if (!platform || !fulfillmentStatus) {
      return NextResponse.json(
        { error: "platform and fulfillmentStatus are required" },
        { status: 400 }
      )
    }

    if (!["UNFULFILLED", "IN_PROGRESS", "FULFILLED"].includes(fulfillmentStatus)) {
      return NextResponse.json(
        { error: "fulfillmentStatus must be UNFULFILLED, IN_PROGRESS, or FULFILLED" },
        { status: 400 }
      )
    }

    // Shopify order IDs in the URL may be percent-encoded GIDs
    // (e.g. "gid%3A%2F%2Fshopify%2FOrder%2F123") — decode before use.
    // WooCommerce and Odoo IDs are plain numeric strings — no-op.
    const rawId = decodeURIComponent(params.id)

    let result: { success: boolean; status: string }

    if (platform === "shopify") {
      result = await updateShopifyFulfillment(rawId, fulfillmentStatus)
    } else if (platform === "woocommerce") {
      result = await updateWooCommerceOrderStatus(Number(rawId), fulfillmentStatus)
    } else if (platform === "odoo") {
      result = await updateOdooOrderStatus(Number(rawId), fulfillmentStatus)
    } else {
      return NextResponse.json(
        { error: `Unsupported platform: ${platform}` },
        { status: 400 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Order Update Error]", error)
    const message = error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
