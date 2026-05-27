// Server-side only — perceptual hash using sharp (dHash algorithm)
import sharp from 'sharp'

export async function computePhash(imageBuffer: Buffer): Promise<string> {
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bits: number[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col
      bits.push(data[idx] > data[idx + 1] ? 1 : 0)
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
    hex += nibble.toString(16)
  }
  return hex
}

export function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const a = parseInt(hash1[i], 16)
    const b = parseInt(hash2[i], 16)
    let diff = a ^ b
    while (diff > 0) {
      distance += diff & 1
      diff >>= 1
    }
  }
  return distance
}

export function isDuplicate(newHash: string, existingHashes: string[], threshold = 10): boolean {
  return existingHashes.some(h => hammingDistance(newHash, h) <= threshold)
}
