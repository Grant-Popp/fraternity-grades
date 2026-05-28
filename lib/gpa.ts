export const GRADE_MAP: Record<string, number> = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'D-': 0.7,
  'F': 0.0,
}

export const VALID_GRADES = new Set(Object.keys(GRADE_MAP))

export function gradeToGpa(grade: string): number | null {
  const g = grade.trim().toUpperCase()
  return GRADE_MAP[g] ?? null
}

export function percentageToGrade(pct: number): string {
  if (pct >= 93) return 'A'
  if (pct >= 90) return 'A-'
  if (pct >= 87) return 'B+'
  if (pct >= 83) return 'B'
  if (pct >= 80) return 'B-'
  if (pct >= 77) return 'C+'
  if (pct >= 73) return 'C'
  if (pct >= 70) return 'C-'
  if (pct >= 67) return 'D+'
  if (pct >= 63) return 'D'
  if (pct >= 60) return 'D-'
  return 'F'
}

export function gpaColorClass(gpa: number): string {
  if (gpa >= 3.0) return 'text-green-400'
  if (gpa >= 2.0) return 'text-yellow-400'
  return 'text-red-400'
}

export function gpaLabel(gpa: number): string {
  if (gpa >= 3.7) return 'A-range'
  if (gpa >= 3.0) return 'B-range'
  if (gpa >= 2.0) return 'C-range'
  if (gpa >= 1.0) return 'D-range'
  return 'Failing'
}

export function averageGpa(gpas: (number | null)[]): number | null {
  const valid = gpas.filter((g): g is number => g !== null)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function gpaToLetter(gpa: number): string {
  if (gpa >= 3.85) return 'A'
  if (gpa >= 3.5)  return 'A-'
  if (gpa >= 3.15) return 'B+'
  if (gpa >= 2.85) return 'B'
  if (gpa >= 2.5)  return 'B-'
  if (gpa >= 2.15) return 'C+'
  if (gpa >= 1.85) return 'C'
  if (gpa >= 1.5)  return 'C-'
  if (gpa >= 1.15) return 'D+'
  if (gpa >= 0.85) return 'D'
  if (gpa >= 0.5)  return 'D-'
  return 'F'
}
