"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type PlatformResult = {
  success: boolean
  product?: Record<string, unknown>
  error?: string
}

export default function AddProductPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<Record<string, PlatformResult> | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    setResults(null)

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          descriptionHtml: description,
          variants: [{ price: price || undefined }],
          imageUrl: imageUrl || undefined,
          imageAlt: title,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to create product")
        return
      }

      setResults(data.results)
    } catch {
      setError("Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const allSucceeded = results && Object.values(results).every((r) => r.success)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to products
      </Link>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Product name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Product description (HTML supported)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            {allSucceeded && (
              <p className="text-sm font-medium text-green-600">
                Created successfully on all platforms!
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating..." : "Create Product"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(results).map(([platform, r]) => (
                <div
                  key={platform}
                  className={`rounded-md border px-4 py-3 text-sm ${
                    r.success
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{platform}</span>
                    <span>{r.success ? "Created" : "Failed"}</span>
                  </div>
                  {r.success && r.product && (
                    <p className="mt-1 text-xs opacity-75">
                      {JSON.stringify(r.product)}
                    </p>
                  )}
                  {r.error && (
                    <p className="mt-1 text-xs opacity-75">{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
