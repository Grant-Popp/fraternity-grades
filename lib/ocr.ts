// Client-side OCR using Tesseract.js — do not import from server-side code
import { gradeToGpa, percentageToGrade, VALID_GRADES } from './gpa'

export interface OcrResult {
  rawText: string
  detectedGrade: string | null
  gpa: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  allGrades: string[]
}

export async function runOcr(imageFile: File): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')

  const preprocessed = await preprocessImage(imageFile)
  const worker = await createWorker('eng')

  try {
    const { data: { text } } = await worker.recognize(preprocessed)
    return parseOcrText(text)
  } finally {
    await worker.terminate()
  }
}

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'grayscale(100%) contrast(150%)'
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.src = URL.createObjectURL(file)
  })
}

function parseOcrText(text: string): OcrResult {
  // Pattern A: explicit "course grade" / "final grade" label nearby
  const patternA = /(?:course\s+grade|final\s+grade|overall\s+grade|letter\s+grade)[\s\S]{0,100}([ABCDF][+-]?)/i
  const matchA = text.match(patternA)
  if (matchA) {
    const grade = matchA[1].toUpperCase()
    if (VALID_GRADES.has(grade)) {
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'high', allGrades: [grade] }
    }
  }

  // Pattern B: standalone letter grades (not part of a longer word)
  const patternB = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g
  const allGrades = [...text.matchAll(patternB)]
    .map(m => m[1].toUpperCase())
    .filter(g => VALID_GRADES.has(g))

  if (allGrades.length > 0) {
    const grade = allGrades[allGrades.length - 1]
    return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades }
  }

  // Pattern C: percentage fallback
  const patternC = /(\d{1,3}(?:\.\d{1,2})?)\s*%/g
  const pctMatches = [...text.matchAll(patternC)]
  if (pctMatches.length > 0) {
    const pct = parseFloat(pctMatches[pctMatches.length - 1][1])
    if (pct >= 0 && pct <= 100) {
      const grade = percentageToGrade(pct)
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'low', allGrades: [grade] }
    }
  }

  return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [] }
}
