export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { shopifyAdminFetch, ADMIN_PRODUCT_QUERY } from "@/lib/shopify-admin"
import type { AdminProductResponse } from "@/lib/types"
import Link from "next/link"
import DeleteButton from "@/components/DeleteButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default async function ProductPage({
  params,
}: {
  params: { handle: string }
}) {
  const { productByHandle: product } =
    await shopifyAdminFetch<AdminProductResponse>({
      query: ADMIN_PRODUCT_QUERY,
      variables: { handle: params.handle },
    })

  if (!product) notFound()

  const numericId = product.id.split("/").pop()!
  const variantPrice = product.variants.nodes[0]?.price ?? "0"
  const currencyCode = product.priceRangeV2.minVariantPrice.currencyCode
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(variantPrice))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to products
        </Link>
        <div className="flex gap-2">
          <Link href={`/products/${params.handle}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <DeleteButton numericId={numericId} />
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            {product.featuredImage && (
              <img
                src={product.featuredImage.url}
                alt={product.featuredImage.altText ?? product.title}
                className="w-full rounded-lg object-cover"
              />
            )}
          </CardContent>
        </Card>

        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            {product.title}
          </h1>
          <p className="mb-6 text-2xl font-semibold text-muted-foreground">
            {formattedPrice}
          </p>
          {product.descriptionHtml && (
            <div
              className="prose prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          )}

          {product.variants.nodes.length > 1 && (
            <div className="mt-8">
              <h3 className="mb-3 text-lg font-semibold">Variants</h3>
              <div className="space-y-2">
                {product.variants.nodes.map((v) => (
                  <Card key={v.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <span className="text-sm font-medium">{v.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: currencyCode,
                        }).format(Number(v.price))}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
