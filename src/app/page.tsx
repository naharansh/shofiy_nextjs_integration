export const dynamic = "force-dynamic"

import { shopifyAdminFetch, ADMIN_PRODUCTS_QUERY, ADMIN_ORDERS_QUERY } from "@/lib/shopify-admin"
import { fetchWooCommerceOrders } from "@/lib/woocommerce"
import { fetchOdooOrders } from "@/lib/odoo"
import type { AdminProductsResponse, AdminOrdersResponse, ShopifyOrder, WooCommerceOrder, OdooOrder, OdooOrderLine, UnifiedOrder } from "@/lib/types"
import ProductCard from "@/components/ProductCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import FulfillmentDropdown from "@/components/FulfillmentDropdown"
import Link from "next/link"

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
                order.status === "PAID" || order.status === "COMPLETED" || order.status === "SALE" || order.status === "DONE"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}>
                {order.status}
              </span>
              <FulfillmentDropdown
                orderId={order.id}
                platform={order.platform}
                currentStatus={order.fulfillmentStatus}
              />
            </div>
          </div>
        </div>
        {order.shippingAddress && (
          <p className="text-xs text-muted-foreground">{order.shippingAddress}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function Home() {
  const [{ products }, { orders }] = await Promise.all([
    shopifyAdminFetch<AdminProductsResponse>({ query: ADMIN_PRODUCTS_QUERY }),
    shopifyAdminFetch<AdminOrdersResponse>({
      query: ADMIN_ORDERS_QUERY,
      variables: { first: 6 },
    }),
  ])

  let wooOrders: WooCommerceOrder[] = []
  try {
    wooOrders = await fetchWooCommerceOrders(6)
  } catch {
    // WooCommerce orders are optional on the home page
  }

  let odooOrders: Awaited<ReturnType<typeof fetchOdooOrders>> = []
  try {
    odooOrders = await fetchOdooOrders(6)
  } catch {
    // Odoo orders are optional on the home page
  }

  const shopifyOrders = orders.nodes.map((o) => toUnifiedOrder(o, "shopify"))
  const wooUnified = wooOrders.map((o) => toUnifiedOrder(o, "woocommerce"))
  const odooUnified = odooOrders.map((o) => toUnifiedOrder(o, "odoo"))
  const allOrders = [...shopifyOrders, ...wooUnified, ...odooUnified].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <div className="flex gap-2">
          <Link href="/products/add">
            <Button>+ Add Product</Button>
          </Link>
          <Link href="/products/bulk">
            <Button variant="outline">Bulk Upload</Button>
          </Link>
          <Link href="/orders">
            <Button variant="outline">Orders</Button>
          </Link>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.nodes.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      <div className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Recent Orders</h2>
          <Link href="/orders">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
        {allOrders.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allOrders.map((order) => (
              <OrderCard key={`${order.platform}-${order.id}`} order={order} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No orders yet
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
