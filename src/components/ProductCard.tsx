"use client"

import Link from "next/link"
import type { AdminProduct } from "@/lib/types"
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function ProductCard({
  product,
}: {
  product: AdminProduct
}) {
  const variantPrice = product.variants.nodes[0]?.price ?? "0"
  const currencyCode = product.priceRangeV2.minVariantPrice.currencyCode
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(variantPrice))

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/products/${product.handle}`} className="block">
        {product.featuredImage && (
          <div className="aspect-square overflow-hidden">
            <img
              src={product.featuredImage.url}
              alt={product.featuredImage.altText ?? product.title}
              className="h-full w-full object-cover transition-transform hover:scale-105"
            />
          </div>
        )}
        <CardContent className={product.featuredImage ? "p-4" : "p-4 pt-6"}>
          <h2 className="text-lg font-semibold leading-tight">{product.title}</h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {formattedPrice}
          </p>
        </CardContent>
      </Link>
      <CardFooter className="px-4 pb-4 pt-0">
        <Link href={`/products/${product.handle}/edit`} className="w-full">
          <Button variant="outline" size="sm" className="w-full">
            Edit
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
