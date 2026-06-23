'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function RecommendPage() {
  return (
    <div className="max-w-2xl">
      <div className="glass-card p-6 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">AI Recommend is temporarily disabled</h1>
            <p className="text-sm text-muted mt-2">
              This module has been turned off for now. It is hidden from navigation and will be re-enabled after the next product update.
            </p>
            <Link
              href="/"
              className="inline-flex items-center mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
