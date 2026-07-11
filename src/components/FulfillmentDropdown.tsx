"use client"

import { useState } from "react"

const STATUS_OPTIONS = [
  { value: "UNFULFILLED", label: "Unfulfilled", color: "bg-yellow-100 text-yellow-800" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-800" },
  { value: "FULFILLED",   label: "Fulfilled",   color: "bg-green-100 text-green-800" },
] as const

type StatusValue = "UNFULFILLED" | "IN_PROGRESS" | "FULFILLED"

/**
 * Normalize any platform-native status string into one of the three
 * supported dropdown values.
 *
 * Shopify:     UNFULFILLED | IN_PROGRESS | FULFILLED | PARTIAL | null
 * WooCommerce: processing  | on-hold     | completed | cancelled | null
 * Odoo:        CONFIRMED   | DELIVERED   | null
 */
function normalizeStatus(raw: string | null | undefined): StatusValue {
  if (!raw) return "UNFULFILLED"

  switch (raw.toUpperCase()) {
    // Explicit fulfilled states
    case "FULFILLED":
    case "COMPLETED":
    case "DELIVERED":
    case "DONE":
      return "FULFILLED"

    // Explicit in-progress / partial states
    case "IN_PROGRESS":
    case "PARTIAL":
    case "PROCESSING":
    case "ON-HOLD":
    case "ON_HOLD":
    case "CONFIRMED":
    case "SALE":
      return "IN_PROGRESS"

    // Everything else → unfulfilled
    case "UNFULFILLED":
    case "PENDING":
    case "DRAFT":
    case "SENT":
    case "CANCELLED":
    case "REFUNDED":
    default:
      return "UNFULFILLED"
  }
}

type Props = {
  orderId: string
  platform: "shopify" | "woocommerce" | "odoo"
  currentStatus: string | null
  onStatusChange?: (newStatus: string) => void
}

export default function FulfillmentDropdown({
  orderId,
  platform,
  currentStatus,
  onStatusChange,
}: Props) {
  const initial = normalizeStatus(currentStatus)
  const initialOption = STATUS_OPTIONS.find((o) => o.value === initial) ?? STATUS_OPTIONS[0]

  const [status, setStatus] = useState<StatusValue>(initial)
  const [color, setColor]   = useState(initialOption.color)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleChange(newValue: string) {
    if (newValue === status) return

    const prevStatus = status
    const prevColor  = color

    const newStatus = newValue as StatusValue
    const newOption = STATUS_OPTIONS.find((o) => o.value === newStatus) ?? STATUS_OPTIONS[0]

    setStatus(newStatus)
    setColor(newOption.color)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, fulfillmentStatus: newValue }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to update")
      }

      onStatusChange?.(newValue)
    } catch (err) {
      setStatus(prevStatus)
      setColor(prevColor)
      setError(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer disabled:opacity-50 ${color}`}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  )
}
