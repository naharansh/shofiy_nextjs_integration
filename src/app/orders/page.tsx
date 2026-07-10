export const dynamic = "force-dynamic"

import { shopifyAdminFetch, ADMIN_ORDERS_QUERY } from "@/lib/shopify-admin"
import { fetchWooCommerceOrders } from "@/lib/woocommerce"
import { fetchOdooOrders } from "@/lib/odoo"
import type { AdminOrdersResponse, ShopifyOrder, WooCommerceOrder, OdooOrder, OdooOrderLine, UnifiedOrder } from "@/lib/types"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(amount))
}

function toUnifiedOrder(
  order: ShopifyOrder | WooCommerceOrder | (OdooOrder & { resolvedLines: OdooOrderLine[] }),
  platform: "shopify" | "woocommerce" | "odoo"
): UnifiedOrder {
  if (platform === "shopify") {
    const o = order as ShopifyOrder
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      total: { amount: o.totalPriceSet.shopMoney.amount, currencyCode: o.totalPriceSet.shopMoney.currencyCode },
      status: o.displayFinancialStatus || "PENDING",
      fulfillmentStatus: o.displayFulfillmentStatus,
      shippingAddress: o.shippingAddress
        ? [o.shippingAddress.address1, o.shippingAddress.city, o.shippingAddress.province, o.shippingAddress.zip, o.shippingAddress.country].filter(Boolean).join(", ")
        : null,
      lineItems: o.lineItems.nodes.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        total: item.originalUnitPriceSet.shopMoney.amount,
      })),
      platform,
    }
  }

  if (platform === "odoo") {
    const o = order as OdooOrder & { resolvedLines: OdooOrderLine[] }
    const stateMap: Record<string, string> = {
      draft: "DRAFT",
      sent: "SENT",
      sale: "SALE",
      done: "DONE",
      cancel: "CANCELLED",
    }
    return {
      id: String(o.id),
      name: o.name,
      createdAt: o.date_order,
      total: { amount: String(o.amount_total), currencyCode: o.currency_id?.[1] || "USD" },
      status: stateMap[o.state] || o.state.toUpperCase(),
      fulfillmentStatus: o.state === "done" ? "DELIVERED" : o.state === "sale" ? "CONFIRMED" : null,
      shippingAddress: null,
      lineItems: o.resolvedLines.map((item) => ({
        id: String(item.id),
        name: item.name,
        quantity: item.product_uom_qty,
        total: String(item.price_subtotal),
      })),
      platform,
    }
  }

  const o = order as WooCommerceOrder
  return {
    id: String(o.id),
    name: `#${o.number}`,
    createdAt: o.date_created,
    total: { amount: o.total, currencyCode: o.currency },
    status: o.status === "processing" ? "PENDING" : o.status === "completed" ? "PAID" : o.status.toUpperCase(),
    fulfillmentStatus: o.status === "completed" ? "FULFILLED" : o.status === "processing" ? "PROCESSING" : null,
    shippingAddress: o.shipping.address_1
      ? [o.shipping.address_1, o.shipping.city, o.shipping.state, o.shipping.postcode, o.shipping.country].filter(Boolean).join(", ")
      : o.billing.address_1
        ? [o.billing.address_1, o.billing.city, o.billing.state, o.billing.postcode, o.billing.country].filter(Boolean).join(", ")
        : null,
    lineItems: o.line_items.map((item) => ({
      id: String(item.id),
      name: item.name,
      quantity: item.quantity,
      total: String(item.total),
    })),
    platform,
  }
}

function OrderCard({ order }: { order: UnifiedOrder }) {
  const date = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{order.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                order.platform === "shopify" ? "bg-emerald-100 text-emerald-800" :
                order.platform === "odoo" ? "bg-orange-100 text-orange-800" :
                "bg-purple-100 text-purple-800"
              }`}>
                {order.platform === "shopify" ? "Shopify" : order.platform === "odoo" ? "Odoo" : "WooCommerce"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{date}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatCurrency(order.total.amount, order.total.currencyCode)}</p>
            <div className="mt-1 flex gap-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                order.status === "PAID" || order.status === "COMPLETED"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}>
                {order.status}
              </span>
              {order.fulfillmentStatus && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  {order.fulfillmentStatus}
                </span>
              )}
            </div>
          </div>
        </div>

        {order.shippingAddress && (
          <p className="mb-2 text-xs text-muted-foreground">{order.shippingAddress}</p>
        )}

        {order.lineItems.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Items ({order.lineItems.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {order.lineItems.map((item) => (
                <li key={item.id} className="flex justify-between text-xs">
                  <span>{item.name} x{item.quantity}</span>
                  <span className="text-muted-foreground">{formatCurrency(item.total, order.total.currencyCode)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

const tabs = [
  { label: "All", value: "all" },
  { label: "Shopify", value: "shopify" },
  { label: "WooCommerce", value: "woocommerce" },
  { label: "Odoo", value: "odoo" },
] as const

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { platform?: string }
}) {
  let shopifyOrders: UnifiedOrder[] = []
  let wooOrders: UnifiedOrder[] = []
  let odooOrders: UnifiedOrder[] = []
  let shopifyError: string | null = null
  let wooError: string | null = null
  let odooError: string | null = null

  try {
    const data = await shopifyAdminFetch<AdminOrdersResponse>({
      query: ADMIN_ORDERS_QUERY,
      variables: { first: 50 },
    })
    shopifyOrders = data.orders.nodes.map((o) => toUnifiedOrder(o, "shopify"))
  } catch (error) {
    shopifyError = error instanceof Error ? error.message : "Something went wrong"
  }

  try {
    const orders = await fetchWooCommerceOrders(50)
    wooOrders = orders.map((o) => toUnifiedOrder(o, "woocommerce"))
  } catch (error) {
    wooError = error instanceof Error ? error.message : "Something went wrong"
  }

  try {
    const orders = await fetchOdooOrders(50)
    odooOrders = orders.map((o) => toUnifiedOrder(o, "odoo"))
  } catch (error) {
    odooError = error instanceof Error ? error.message : "Something went wrong"
  }

  const allOrders = [...shopifyOrders, ...wooOrders, ...odooOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const activeTab = tabs.find((t) => t.value === searchParams.platform)?.value ?? "all"

  const filteredOrders =
    activeTab === "all" ? allOrders : allOrders.filter((o) => o.platform === activeTab)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <Link href="/">
          <Button variant="outline">&larr; Products</Button>
        </Link>
      </div>

      {shopifyError && (
        <Card className="mb-4 border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-yellow-800">
              Could not load orders from Shopify.
            </p>
            <p className="mt-1 text-xs text-yellow-700">
              {shopifyError.includes("ACCESS_DENIED")
                ? "The Shopify access token needs the read_orders scope."
                : shopifyError}
            </p>
          </CardContent>
        </Card>
      )}

      {wooError && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-800">
              Could not load orders from WooCommerce.
            </p>
            <p className="mt-1 text-xs text-red-700">{wooError}</p>
          </CardContent>
        </Card>
      )}

      {odooError && (
        <Card className="mb-4 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-orange-800">
              Could not load orders from Odoo.
            </p>
            <p className="mt-1 text-xs text-orange-700">{odooError}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex gap-1 rounded-lg border bg-muted p-1">
        {tabs.map((tab) => {
          const href = tab.value === "all" ? "/orders" : `/orders?platform=${tab.value}`
          return (
            <Link
              key={tab.value}
              href={href}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No orders yet
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <OrderCard key={`${order.platform}-${order.id}`} order={order} />
          ))}
        </div>
      )}
    </main>
  )
}
