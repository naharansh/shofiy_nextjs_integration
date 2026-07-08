export const dynamic = "force-dynamic"

import { shopifyAdminFetch, ADMIN_PRODUCTS_QUERY } from "@/lib/shopify-admin"
import type { AdminProductsResponse } from "@/lib/types"
import ProductCard from "@/components/ProductCard"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function Home() {
  const { products } = await shopifyAdminFetch<AdminProductsResponse>({
    query: ADMIN_PRODUCTS_QUERY,
  })

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <Link href="/products/add">
          <Button>+ Add Product</Button>
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.nodes.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  )
}
