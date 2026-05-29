interface Props {
  size?: number
  className?: string
}

export default function CardinalLogo({ size = 48, className = '' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Tail */}
      <path d="M13 72 C6 82 3 95 11 88 C15 78 19 73 13 72Z" fill="#AD0000"/>
      {/* Body */}
      <ellipse cx="41" cy="67" rx="26" ry="18" fill="#AD0000"/>
      {/* Head */}
      <circle cx="64" cy="44" r="20" fill="#AD0000"/>
      {/* Crest */}
      <path d="M63 26 C65 14 70 5 67 13 C65 20 64 26 63 26Z" fill="#AD0000"/>
      <path d="M55 27 C54 17 57 8 57 15 C56 21 55 26 55 27Z" fill="#AD0000"/>
      <path d="M71 29 C77 19 81 12 77 18 C73 24 71 29 71 29Z" fill="#AD0000"/>
      {/* Wing dark detail */}
      <path d="M15 70 Q35 82 58 78 Q37 87 13 77Z" fill="#8B0000"/>
      {/* Face mask */}
      <ellipse cx="75" cy="48" rx="11" ry="8" fill="#111"/>
      {/* Beak */}
      <path d="M81 40 L98 35 L81 49Z" fill="#E8820C"/>
      <path d="M81 40 L98 35 L90 43Z" fill="#C46B08"/>
      {/* Eye */}
      <circle cx="64" cy="38" r="4.5" fill="#111"/>
      <circle cx="63" cy="37" r="1.8" fill="white"/>
    </svg>
  )
}
