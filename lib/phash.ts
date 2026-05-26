// Server-side only — perceptual hash using sharp (dHash algorithm)
import sharp from 'sharp'

export async function computePhash(imageBuffer: Buffer): Promise<string> {
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let hash = 0n
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col
      const bit = data[idx] > data[idx + 1] ? 1n : 0n
      hash = (hash << 1n) | bit
    }
  }
  return hash.toString(16).padStart(16, '0')
}

export function hammingDistance(hash1: string, hash2: string): number {
  const a = BigInt('0x' + hash1)
  const b = BigInt('0x' + hash2)
  let diff = a ^ b
  let distance = 0
  while (diff > 0n) {
    distance += Number(diff & 1n)
    diff >>= 1n
  }
  return distance
}

// Returns true if images are likely the same (possible re-submission of old photo)
export function isDuplicate(newHash: string, existingHashes: string[], threshold = 10): boolean {
  return existingHashes.some(h => hammingDistance(newHash, h) <= threshold)
}
