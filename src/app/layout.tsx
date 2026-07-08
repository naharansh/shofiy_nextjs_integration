import type { Metadata } from "next"
import "./global.css"

export const metadata: Metadata = {
  title: "Shopify Next",
  description: "Shopify product showcase built with Next.js",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
