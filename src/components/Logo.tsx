/** Identidade Widgy: calendário azul com sakura de cinco pétalas.
 * A mesma arte vetorial alimenta o app, o splash e os ícones do instalador.
 */
const petal = "M0 0C-15-9-19-31-8-43L0-37 8-43C19-31 15-9 0 0Z"
const angles = [0, 72, 144, 216, 288]

export function Logo({ size = 48, animated = false, glyphOnly = false }: { size?: number; animated?: boolean; glyphOnly?: boolean }) {
  const animation = animated ? "widgy-mark-in 700ms cubic-bezier(.16,1,.3,1) both" : undefined

  if (glyphOnly) return (
    <svg width={size} height={size} viewBox="-46 -46 92 92" role="img" aria-label="Sakura do Widgy" style={{ animation }}>
      <g fill="#DDF1FF">
        {angles.map((deg) => <path key={deg} d={petal} transform={`rotate(${deg})`} />)}
      </g>
      <g fill="#2184EA">
        {angles.map((deg) => <ellipse key={deg} cy="-11.8" rx="2.2" ry="4.6" transform={`rotate(${deg})`} />)}
      </g>
      <circle r="4" fill="#F2FAFF" />
    </svg>
  )

  return (
    <img
      src="logos/widgy.svg"
      alt="Widgy"
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, display: "block", objectFit: "contain", animation }}
    />
  )
}
