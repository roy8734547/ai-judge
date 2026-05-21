import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '⚖️ AI Judge — Relationship Conflict Arbitration',
  description: 'Let AI settle your disputes with wisdom and flair',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
