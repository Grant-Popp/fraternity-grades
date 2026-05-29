interface Props {
  size?: number
  className?: string
}

export default function CardinalLogo({ size = 48, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/cardinal.png"
      alt="UofL Cardinals"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
