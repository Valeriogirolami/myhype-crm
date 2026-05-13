/**
 * Logo Hype — placeholder SVG fedele alla descrizione §0:
 * "H stilizzata composta da 3 barre verticali spezzate, attraversata da una linea curva.
 *  Tipografia geometrica con lettere aperte."
 *
 * Potrà essere sostituito col logo ufficiale quando Valerio lo fornirà.
 */
export default function HypeLogo({ size = 32, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hype-grad" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="#2B6CFF" />
            <stop offset="100%" stopColor="#5B8FFF" />
          </linearGradient>
        </defs>
        {/* Le 3 barre verticali spezzate che compongono la H */}
        <rect x="6"  y="8"  width="5" height="14" rx="1.5" fill="url(#hype-grad)" />
        <rect x="6"  y="26" width="5" height="14" rx="1.5" fill="url(#hype-grad)" />
        <rect x="21" y="8"  width="5" height="32" rx="1.5" fill="url(#hype-grad)" />
        <rect x="36" y="8"  width="5" height="14" rx="1.5" fill="url(#hype-grad)" />
        <rect x="36" y="26" width="5" height="14" rx="1.5" fill="url(#hype-grad)" />
        {/* Linea curva che attraversa la H */}
        <path
          d="M 4 28 Q 24 14 44 28"
          stroke="url(#hype-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
      </svg>
      <span className="text-xl font-semibold tracking-tight text-white">
        MyHype
      </span>
    </div>
  )
}
