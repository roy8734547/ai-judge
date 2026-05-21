'use client'

export default function Header() {
  return (
    <header className="border-b border-navy-800 bg-navy-950/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="text-3xl" role="img" aria-label="scales of justice">⚖️</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">
              AI Judge
            </h1>
            <p className="text-gold-500 text-xs tracking-widest uppercase font-medium">
              Relationship Arbitration
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
