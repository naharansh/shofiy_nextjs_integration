import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const text = await request.text()
    const data = JSON.parse(text)

    console.log("Shopify order webhook received:", {
      id: data.id,
      name: data.name,
      email: data.email,
      totalPrice: data.total_price,
      createdAt: data.created_at,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong"
    console.error("Webhook error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
