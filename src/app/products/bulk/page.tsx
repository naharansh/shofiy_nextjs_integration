"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type PlatformResult = {
  success: boolean
  product?: Record<string, unknown>
  error?: string
}

type BulkResult = {
  index: number
  title: string
  results: Record<string, PlatformResult>
}

const defaultJson = JSON.stringify(
  [
    { title: "Product 1", price: "19.99", descriptionHtml: "<p>Description 1</p>" },
    { title: "Product 2", price: "29.99", descriptionHtml: "<p>Description 2</p>" },
    { title: "Product 3", price: "39.99", descriptionHtml: "<p>Description 3</p>" },
  ],
  null,
  2
)

export default function BulkUploadPage() {
  const [jsonInput, setJsonInput] = useState(defaultJson)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const [summary, setSummary] = useState<{
    total: number
    succeeded: number
    failed: number
  } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    setResults(null)
    setSummary(null)

    let products: unknown[]
    try {
      products = JSON.parse(jsonInput)
    } catch {
      setError("Invalid JSON. Please check your input.")
      setSubmitting(false)
      return
    }

    if (!Array.isArray(products) || products.length === 0) {
      setError("Input must be a non-empty array of products.")
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Bulk upload failed")
        return
      }

      setResults(data.results)
      setSummary(data.summary)
    } catch {
      setError("Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to products
      </Link>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Bulk Product Upload</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each product is created on all platforms (Shopify, WooCommerce, Odoo)
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="json">
                Products (JSON array)
              </Label>
              <Textarea
                id="json"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder='[{ "title": "Product name", "price": "19.99", "descriptionHtml": "<p>...</p>", "imageUrl": "https://..." }]'
              />
              <p className="text-xs text-muted-foreground">
                Each product supports: title (required), price, descriptionHtml, imageUrl, imageAlt
              </p>
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Uploading..." : "Upload to All Platforms"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {summary && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              <span>
                Total operations: <strong>{summary.total}</strong>
              </span>
              <span className="text-green-600">
                Succeeded: <strong>{summary.succeeded}</strong>
              </span>
              <span className="text-destructive">
                Failed: <strong>{summary.failed}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {results && results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.map((r) => (
                <div key={r.index} className="rounded-md border px-4 py-3">
                  <p className="mb-2 text-sm font-medium">{r.title}</p>
                  <div className="space-y-1">
                    {Object.entries(r.results).map(([platform, pr]) => (
                      <div
                        key={platform}
                        className={`rounded px-3 py-2 text-xs ${
                          pr.success
                            ? "bg-green-50 text-green-800"
                            : "bg-red-50 text-red-800"
                        }`}
                      >
                        <span className="font-medium capitalize">{platform}:</span>{" "}
                        {pr.success
                          ? "Created"
                          : pr.error}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
