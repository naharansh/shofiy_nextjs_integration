import { NextResponse } from "next/server"
import { shopifyAdminFetch, ADMIN_ORDERS_QUERY } from "@/lib/shopify-admin"
import type { AdminOrdersResponse } from "@/lib/types"

export async function GET() {
  try {
    const data = await shopifyAdminFetch<AdminOrdersResponse>({
      query: ADMIN_ORDERS_QUERY,
      variables: { first: 50 },
    })

    return NextResponse.json(data.orders)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
