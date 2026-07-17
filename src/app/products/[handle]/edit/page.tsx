"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter, useParams } from "next/navigation"
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

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const handle = params.handle as string

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [numericId, setNumericId] = useState("")
  const [odooProductId, setOdooProductId] = useState<number | null>(null)
  const [results, setResults] = useState<Record<string, PlatformResult> | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/products?handle=${handle}`)
        if (!res.ok) throw new Error("Not found")
        const data = await res.json()
        setTitle(data.title)
        setDescription(data.descriptionHtml || "")
        setPrice(data.price || "")
        setNumericId(data.numericId)
        setOdooProductId(data.odooProductId ?? null)
      } catch {
        setError("Failed to load product")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [handle])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    setResults(null)

    try {
      const res = await fetch(`/api/products/${numericId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          descriptionHtml: description,
          price: price || undefined,
          odooProductId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to update product")
        return
      }

      if (data.results) {
        setResults(data.results)
        const allSucceeded = Object.values(
          data.results as Record<string, PlatformResult>
        ).every((r) => r.success)
        if (allSucceeded) {
          setTimeout(() => router.push(`/products/${handle}`), 1500)
        }
      } else {
        router.push(`/products/${handle}`)
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link
        href={`/products/${handle}`}
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to product
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit Product</CardTitle>
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
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
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card className="mt-4">
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
                    <span>{r.success ? "Updated" : "Failed"}</span>
                  </div>
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
