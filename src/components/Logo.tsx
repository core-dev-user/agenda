const PETAL = "M0,0 C-15,-9 -19,-31 -8,-43 L0,-37 L8,-43 C19,-31 15,-9 0,0Z"

/** Logo do Agenda: sakura num ícone de vidro com argolas de agenda. */
export function Logo({ size = 48, animated = false, glyphOnly = false }: { size?: number; animated?: boolean; glyphOnly?: boolean }) {
  const petals = [0, 72, 144, 216, 288]
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-label="Agenda">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a1835" />
          <stop offset="0.55" stopColor="#7a2a5c" />
          <stop offset="1" stopColor="#ff8fb8" />
        </linearGradient>
        <linearGradient id="lg-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".75" />
          <stop offset=".4" stopColor="#fff" stopOpacity=".1" />
          <stop offset="1" stopColor="#fff" stopOpacity=".35" />
        </linearGradient>
        <radialGradient id="lg-petal" cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#ff5f9e" />
          <stop offset=".45" stopColor="#ffb3cf" />
          <stop offset="1" stopColor="#fff2f7" />
        </radialGradient>
        <radialGradient id="lg-shine" cx=".3" cy=".1" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="lg-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#5a0f35" floodOpacity=".45" />
        </filter>
      </defs>

      {!glyphOnly && (
        <>
          <rect x="6" y="10" width="116" height="112" rx="30" fill="url(#lg-bg)" />
          <rect x="6" y="10" width="116" height="112" rx="30" fill="url(#lg-shine)" />
          <rect x="6.75" y="10.75" width="114.5" height="110.5" rx="29.25" fill="none" stroke="url(#lg-rim)" strokeWidth="1.5" />
          {/* argolas da agenda */}
          {[40, 88].map((x) => (
            <g key={x}>
              <rect x={x - 5} y="2" width="10" height="20" rx="5" fill="#2a0f24" opacity=".55" />
              <rect x={x - 4} y="1" width="8" height="19" rx="4" fill="#fde7f0" />
              <rect x={x - 2.5} y="2.5" width="2.2" height="15" rx="1.1" fill="#fff" opacity=".9" />
            </g>
          ))}
        </>
      )}

      <g transform="translate(64 70)" filter="url(#lg-shadow)">
        {petals.map((deg, i) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path
              d={PETAL}
              fill="url(#lg-petal)"
              stroke="#fff"
              strokeOpacity=".5"
              strokeWidth=".8"
              className={animated ? "petal-bloom" : undefined}
              style={animated ? { animationDelay: `${0.35 + i * 0.12}s` } : undefined}
            />
          </g>
        ))}
        <circle r="7" fill="#ff4d8d" />
        {petals.map((deg) => (
          <g key={"s" + deg} transform={`rotate(${deg + 36})`}>
            <line x1="0" y1="0" x2="0" y2="-13" stroke="#ffd36e" strokeWidth="1.2" strokeLinecap="round" />
            <circle cy="-14" r="2" fill="#ffe08a" />
          </g>
        ))}
        <circle r="3" fill="#ffe7a8" />
      </g>
    </svg>
  )
}
