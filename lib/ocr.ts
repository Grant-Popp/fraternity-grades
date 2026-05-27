// Client-side OCR using Tesseract.js — do not import from server-side code
import { gradeToGpa, percentageToGrade, VALID_GRADES } from './gpa'

function execAll(str: string, re: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = []
  const r = new RegExp(re.source, re.flags)
  let m: RegExpExecArray | null
  while ((m = r.exec(str)) !== null) results.push(m)
  return results
}

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
    const gradesOnLine = execAll(afterCourse, gradeRe)
      .map(m => m[1].toUpperCase())
      .filter(g => VALID_GRADES.has(g))

    if (gradesOnLine.length > 0) {
      result[courseId] = gradesOnLine[gradesOnLine.length - 1]
    } else if (i + 1 < lines.length) {
      // Grade may appear on the next line due to OCR line wrapping
      const nextLineGrades = execAll(lines[i + 1], gradeRe)
        .map(m => m[1].toUpperCase())
        .filter(g => VALID_GRADES.has(g))
      if (nextLineGrades.length > 0) {
        result[courseId] = nextLineGrades[nextLineGrades.length - 1]
      }
    }
  }

  return result
}

// Sanity check: does this text look like an academic grade report?
function looksLikeGradeReport(text: string): boolean {
  const lower = text.toLowerCase()
  const keywords = ['grade', 'gpa', 'credit', 'course', 'points', 'blackboard', 'current', 'semester',
    'enrolled', 'instructor', 'section', 'gradebook', 'cumulative', 'term', 'canvas', 'moodle']
  if (keywords.some(kw => lower.includes(kw))) return true
  // Course ID pattern (e.g. ENGR 110, CS 315)
  if (/\b[A-Z]{2,4}\s{0,3}\d{3}\b/.test(text)) return true
  // Academic percentage (e.g. 84.97%)
  if (/\b\d{2,3}\.\d+\s*%/.test(text)) return true
  return false
}

function parseOcrText(text: string): OcrResult {
  const courseGrades = parseCourseGrades(text)

  // Pattern A: explicit "course grade" / "final grade" label nearby — always valid regardless of context
  const patternA = /(?:course\s+grade|final\s+grade|overall\s+grade|letter\s+grade)[\s\S]{0,100}([ABCDF][+-]?)/i
  const matchA = text.match(patternA)
  if (matchA) {
    const grade = matchA[1].toUpperCase()
    if (VALID_GRADES.has(grade)) {
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'high', allGrades: [grade], courseGrades }
    }
  }

  // Patterns B and C require the image to actually look like a grade report
  if (!looksLikeGradeReport(text)) {
    return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades }
  }

  // Pattern B: standalone letter grades (not part of a longer word)
  const patternB = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g
  const allGrades = execAll(text, patternB)
    .map(m => m[1].toUpperCase())
    .filter(g => VALID_GRADES.has(g))

  if (allGrades.length > 0) {
    const grade = allGrades[allGrades.length - 1]
    return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades, courseGrades }
  }

  // Pattern C: percentage fallback
  const patternC = /(\d{1,3}(?:\.\d{1,2})?)\s*%/g
  const pctMatches = execAll(text, patternC)
  if (pctMatches.length > 0) {
    const pct = parseFloat(pctMatches[pctMatches.length - 1][1])
    if (pct >= 0 && pct <= 100) {
      const grade = percentageToGrade(pct)
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades: [grade], courseGrades }
    }
  }

  return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades }
}
