// Client-side OCR using Tesseract.js — do not import from server-side code
import { gradeToGpa, percentageToGrade, VALID_GRADES } from './gpa'

export interface OcrResult {
  rawText: string
  detectedGrade: string | null
  gpa: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  allGrades: string[]
  courseGrades: Record<string, string>
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

// Extract per-course grades from lines like "ENGR 110  Engineering Fundamentals  A  91.5%"
function parseCourseGrades(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.split('\n')
  const gradeRe = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match dept code (2-4 uppercase letters) followed by 3-digit course number, e.g. ENGR 110, CS 315
    const courseMatch = line.match(/\b([A-Z]{2,4})\s{0,3}(\d{3}[A-Z]?)\b/)
    if (!courseMatch) continue

    const courseId = `${courseMatch[1]} ${courseMatch[2]}`
    if (courseId in result) continue

    // Look for the last letter grade on this line after the course ID
    const afterCourse = line.slice(courseMatch.index! + courseMatch[0].length)
    const gradesOnLine = [...afterCourse.matchAll(gradeRe)]
      .map(m => m[1].toUpperCase())
      .filter(g => VALID_GRADES.has(g))

    if (gradesOnLine.length > 0) {
      result[courseId] = gradesOnLine[gradesOnLine.length - 1]
    } else if (i + 1 < lines.length) {
      // Grade may appear on the next line due to OCR line wrapping
      const nextLineGrades = [...lines[i + 1].matchAll(gradeRe)]
        .map(m => m[1].toUpperCase())
        .filter(g => VALID_GRADES.has(g))
      if (nextLineGrades.length > 0) {
        result[courseId] = nextLineGrades[nextLineGrades.length - 1]
      }
    }
  }

  return result
}

function parseOcrText(text: string): OcrResult {
  const courseGrades = parseCourseGrades(text)

  // Pattern A: explicit "course grade" / "final grade" label nearby
  const patternA = /(?:course\s+grade|final\s+grade|overall\s+grade|letter\s+grade)[\s\S]{0,100}([ABCDF][+-]?)/i
  const matchA = text.match(patternA)
  if (matchA) {
    const grade = matchA[1].toUpperCase()
    if (VALID_GRADES.has(grade)) {
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'high', allGrades: [grade], courseGrades }
    }
  }

  // Pattern B: standalone letter grades (not part of a longer word)
  const patternB = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g
  const allGrades = [...text.matchAll(patternB)]
    .map(m => m[1].toUpperCase())
    .filter(g => VALID_GRADES.has(g))

  if (allGrades.length > 0) {
    const grade = allGrades[allGrades.length - 1]
    return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades, courseGrades }
  }

  // Pattern C: percentage fallback
  const patternC = /(\d{1,3}(?:\.\d{1,2})?)\s*%/g
  const pctMatches = [...text.matchAll(patternC)]
  if (pctMatches.length > 0) {
    const pct = parseFloat(pctMatches[pctMatches.length - 1][1])
    if (pct >= 0 && pct <= 100) {
      const grade = percentageToGrade(pct)
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'low', allGrades: [grade], courseGrades }
    }
  }

  return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades }
}
