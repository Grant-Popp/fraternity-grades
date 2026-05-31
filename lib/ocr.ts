// Client-side OCR using Tesseract.js — do not import from server-side code
import { gradeToGpa, gpaToLetter, percentageToGrade, VALID_GRADES } from './gpa'

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
  directGpa: number | null  // GPA detected as a number, not inferred from a letter grade
}

export async function runOcr(imageFile: File): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')

  const preprocessed = await preprocessImage(imageFile)
  const worker = await createWorker('eng')

  try {
    // PSM 6 = "Assume a single uniform block of text" — best for grade tables
    await worker.setParameters({ tessedit_pageseg_mode: '6' } as any)
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
      // 2× upscale for images under 1600px wide — dramatically improves OCR on typical screenshots
      const scale = img.width < 1600 ? 2 : img.width < 2400 ? 1.5 : 1
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      // Draw scaled
      ctx.drawImage(img, 0, 0, w, h)

      // Manual grayscale + contrast stretch (more consistent than CSS filters)
      const id = ctx.getImageData(0, 0, w, h)
      const d = id.data
      let totalLum = 0
      for (let i = 0; i < d.length; i += 4) {
        // Weighted luminance (ITU-R BT.601)
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        // Contrast stretch — pushes mid-grays toward black/white for sharper text
        const c = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128))
        d[i] = d[i + 1] = d[i + 2] = c
        totalLum += c
      }
      // Dark-mode inversion: Blackboard and similar apps use white text on dark background.
      // Tesseract reads black-on-white, so invert any screenshot where the average pixel is dark.
      const avgLum = totalLum / (d.length / 4)
      if (avgLum < 110) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[i + 1] = d[i + 2] = 255 - d[i]
        }
      }
      ctx.putImageData(id, 0, 0)

      // Mild sharpen pass via convolution kernel
      const id2 = ctx.getImageData(0, 0, w, h)
      const src = new Uint8ClampedArray(id2.data)
      const dst = id2.data
      const kern = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0]
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let v = 0
          for (let ky = -1; ky <= 1; ky++)
            for (let kx = -1; kx <= 1; kx++)
              v += src[((y + ky) * w + x + kx) * 4] * kern[(ky + 1) * 3 + kx + 1]
          const p = (y * w + x) * 4
          const clamped = Math.min(255, Math.max(0, v))
          dst[p] = dst[p + 1] = dst[p + 2] = clamped
        }
      }
      ctx.putImageData(id2, 0, 0)

      resolve(canvas)
    }
    img.src = URL.createObjectURL(file)
  })
}

// Extract per-course grades from lines like "ENGR 110  Engineering Fundamentals  A  91.5%"
// Also handles compact formats: CS315, MATH1010
function parseCourseGrades(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.split('\n')
  const gradeRe = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match dept+number formats: "ENGR 110", "CS315", "MATH 1010", "BIOE 205A"
    const courseMatch = line.match(/\b([A-Z]{2,5})\s{0,2}(\d{3,4}[A-Z]?)\b/)
    if (!courseMatch) continue

    const courseId = `${courseMatch[1]} ${courseMatch[2]}`
    if (courseId in result) continue

    const afterCourse = line.slice(courseMatch.index! + courseMatch[0].length)
    const gradesOnLine = execAll(afterCourse, gradeRe)
      .map(m => m[1].toUpperCase())
      .filter(g => VALID_GRADES.has(g))

    if (gradesOnLine.length > 0) {
      result[courseId] = gradesOnLine[gradesOnLine.length - 1]
    } else if (i + 1 < lines.length) {
      // Grade may be on the next line due to OCR line wrapping
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
  const keywords = [
    'grade', 'gpa', 'credit', 'course', 'points', 'blackboard', 'current', 'semester',
    'enrolled', 'instructor', 'section', 'gradebook', 'cumulative', 'term', 'canvas',
    'moodle', 'banner', 'academic', 'transcript', 'weighted', 'earned', 'attempted',
  ]
  if (keywords.some(kw => lower.includes(kw))) return true
  // Course ID pattern (e.g. ENGR 110, CS 315, BIOE205)
  if (/\b[A-Z]{2,5}\s{0,2}\d{3,4}\b/.test(text)) return true
  // Academic percentage (e.g. 84.97%)
  if (/\b\d{2,3}\.\d+\s*%/.test(text)) return true
  return false
}

function parseOcrText(text: string): OcrResult {
  const courseGrades = parseCourseGrades(text)

  // Pattern A: explicit "course grade" / "final grade" label nearby
  const patternA = /(?:course\s+grade|final\s+grade|overall\s+grade|letter\s+grade)[\s\S]{0,100}([ABCDF][+-]?)/i
  const matchA = text.match(patternA)
  if (matchA) {
    const grade = matchA[1].toUpperCase()
    if (VALID_GRADES.has(grade)) {
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'high', allGrades: [grade], courseGrades, directGpa: null }
    }
  }

  // Pattern A.5: GPA number directly shown (e.g., "Overall GPA: 3.56", "Cumulative GPA 3.82", "GPA: 3.45")
  // Catches grade portals that display the numeric GPA directly rather than a letter
  const gpaRe = /(?:overall|cumulative|current|semester|term|course|total)[\s\S]{0,40}?(\d\.\d{1,2})|(\d\.\d{1,2})[\s\S]{0,30}?(?:gpa|grade\s+points)|gpa[\s:]+(\d\.\d{1,2})/i
  const gpaMatch = text.match(gpaRe)
  if (gpaMatch) {
    const raw = gpaMatch[1] ?? gpaMatch[2] ?? gpaMatch[3]
    const gpaVal = raw ? parseFloat(raw) : NaN
    if (!isNaN(gpaVal) && gpaVal >= 0.0 && gpaVal <= 4.0) {
      const letter = gpaToLetter(gpaVal)
      return { rawText: text, detectedGrade: letter, gpa: gpaVal, confidence: 'high', allGrades: [letter], courseGrades, directGpa: gpaVal }
    }
  }

  // Patterns B and C require the image to actually look like a grade report
  if (!looksLikeGradeReport(text)) {
    return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades, directGpa: null }
  }

  // Pattern B: standalone letter grades (not part of a longer word)
  const patternB = /(?<![A-Za-z])([ABCDF][+-]?)(?![A-Za-z])/g
  const allGrades = execAll(text, patternB)
    .map(m => m[1].toUpperCase())
    .filter(g => VALID_GRADES.has(g))

  if (allGrades.length > 0) {
    const grade = allGrades[allGrades.length - 1]
    return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades, courseGrades, directGpa: null }
  }

  // Pattern C: percentage fallback — only accept realistic grade percentages (60-100)
  // Anything below 60 can't be a real letter grade and was almost certainly a false OCR match
  const patternC = /(\d{1,3}(?:\.\d{1,2})?)\s*%/g
  const pctMatches = execAll(text, patternC)
  if (pctMatches.length > 0) {
    const pct = parseFloat(pctMatches[pctMatches.length - 1][1])
    if (pct >= 60 && pct <= 100) {
      const grade = percentageToGrade(pct)
      return { rawText: text, detectedGrade: grade, gpa: gradeToGpa(grade), confidence: 'medium', allGrades: [grade], courseGrades, directGpa: null }
    }
  }

  return { rawText: text, detectedGrade: null, gpa: null, confidence: 'none', allGrades: [], courseGrades, directGpa: null }
}
