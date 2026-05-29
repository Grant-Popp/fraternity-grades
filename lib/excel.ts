import ExcelJS from 'exceljs'
import type { Profile, Submission, Semester, SemesterRound } from './database.types'

export async function generateAllSemestersExcel(
  members: Profile[],
  allSubmissions: Submission[],
  semesters: Semester[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Chapter Grade Portal'
  workbook.created = new Date()

  const semsSorted = [...semesters].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const membersSorted = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name))

  // ── GPA History pivot ──────────────────────────────────────
  {
    const ws = workbook.addWorksheet('GPA History')
    const cols: Partial<ExcelJS.Column>[] = [{ key: 'name', width: 24 }, { key: 'year', width: 14 }]
    semsSorted.forEach(s => cols.push({ key: s.id, width: 14 }))
    cols.push({ key: 'avg', width: 12 })
    ws.columns = cols

    // Header
    const hdr = ws.getRow(1)
    hdr.getCell(1).value = 'Member'
    hdr.getCell(2).value = 'Year'
    semsSorted.forEach((s, i) => { hdr.getCell(3 + i).value = s.name })
    hdr.getCell(3 + semsSorted.length).value = 'Overall Avg'
    hdr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    ws.getRow(1).height = 24

    membersSorted.forEach((m, mi) => {
      const row = ws.getRow(2 + mi)
      row.getCell(1).value = m.full_name
      row.getCell(2).value = m.class_year
      row.getCell(2).alignment = { horizontal: 'center' }
      const gpas: number[] = []
      semsSorted.forEach((s, si) => {
        const sub = allSubmissions.find(x => x.member_id === m.id && x.semester_id === s.id)
        const gpa = sub?.final_gpa ?? null
        const cell = row.getCell(3 + si)
        cell.value = gpa !== null ? +gpa.toFixed(2) : sub ? 'N/A' : '—'
        cell.alignment = { horizontal: 'center' }
        if (gpa !== null) {
          cell.fill = gpaFill(gpa)!
          cell.font = { bold: true, color: { argb: gpaFontColor(gpa) } }
          gpas.push(gpa)
        }
      })
      const avg = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
      const avgCell = row.getCell(3 + semsSorted.length)
      avgCell.value = avg !== null ? +avg.toFixed(2) : '—'
      avgCell.alignment = { horizontal: 'center' }
      if (avg !== null) {
        avgCell.fill = gpaFill(avg)!
        avgCell.font = { bold: true, color: { argb: gpaFontColor(avg) } }
      }
      if (mi % 2 === 0) {
        [1, 2].forEach(c => {
          if (!row.getCell(c).fill || (row.getCell(c).fill as any).fgColor?.argb === undefined) {
            row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } }
          }
        })
      }
    })
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  }

  // ── One summary sheet per semester ────────────────────────
  for (const sem of semsSorted) {
    const subs = allSubmissions.filter(s => s.semester_id === sem.id)
    const subByMember = new Map<string, Submission>()
    subs.forEach(s => subByMember.set(s.member_id, s))

    const sheetName = sem.name.substring(0, 28).replace(/[*?:/\\[\]]/g, '')
    const ws = workbook.addWorksheet(sheetName)
    ws.columns = [
      { key: 'name', width: 24 }, { key: 'year', width: 14 },
      { key: 'gpa', width: 10 }, { key: 'status', width: 14 },
    ]

    ws.mergeCells('A1:D1')
    const title = ws.getCell('A1')
    title.value = sem.name
    title.font = { bold: true, size: 13, color: { argb: DARK_NAVY } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } }
    title.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 26

    headerRow(ws, ['Name', 'Year', 'GPA', 'Status'], 2)

    membersSorted.forEach((m, i) => {
      const sub = subByMember.get(m.id)
      const gpa = sub?.final_gpa ?? null
      const row = ws.getRow(3 + i)
      row.getCell(1).value = m.full_name
      row.getCell(2).value = m.class_year
      row.getCell(3).value = gpa !== null ? +gpa.toFixed(2) : '—'
      row.getCell(4).value = sub?.status ?? 'Not Submitted'
      row.getCell(2).alignment = { horizontal: 'center' }
      row.getCell(3).alignment = { horizontal: 'center' }
      row.getCell(4).alignment = { horizontal: 'center' }
      if (gpa !== null) {
        row.getCell(3).fill = gpaFill(gpa)!
        row.getCell(3).font = { bold: true, color: { argb: gpaFontColor(gpa) } }
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

const GOLD = 'FFFFF59E0B' // actually ARGB: FF + hex color
const DARK_NAVY = 'FF0F172A'
const WHITE = 'FFFFFFFF'
const GREEN = 'FF166534'
const YELLOW = 'FF854D0E'
const RED = 'FF991B1B'
const LIGHT_GREEN = 'FFBBF7D0'
const LIGHT_YELLOW = 'FFFEF08A'
const LIGHT_RED = 'FFFECACA'
const GREY_BG    = 'FFF1F5F9'
const LIGHT_AMBER = 'FFFED7AA'
const AMBER_TEXT  = 'FF92400E'

function gpaFill(gpa: number | null): { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } } | undefined {
  if (gpa === null) return undefined
  const argb = gpa >= 3.0 ? LIGHT_GREEN : gpa >= 2.0 ? LIGHT_YELLOW : LIGHT_RED
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function gpaFontColor(gpa: number | null): string {
  if (gpa === null) return 'FF475569'
  return gpa >= 3.0 ? GREEN : gpa >= 2.0 ? YELLOW : RED
}

function headerRow(sheet: ExcelJS.Worksheet, cols: string[], rowNum: number) {
  const row = sheet.getRow(rowNum)
  cols.forEach((col, i) => {
    const cell = row.getCell(i + 1)
    cell.value = col
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
    cell.border = { bottom: { style: 'thin', color: { argb: GOLD } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 24
}

async function buildBarChartPng(
  yearData: Array<{ year: string; count: number; avg: number | null }>
): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default
    const W = 520, H = 250
    const cL = 52, cR = W - 16, cT = 36, cB = H - 46
    const cW = cR - cL, cH = cB - cT
    const toY = (g: number): number => cB - (g / 4.0) * cH
    const barW = 72, barGap = 28
    const totalBarW = yearData.length * barW + Math.max(0, yearData.length - 1) * barGap
    const barsStart = cL + (cW - totalBarW) / 2

    const gridLines = [1, 2, 3, 4].map(g => {
      const y = toY(g)
      return `<line x1="${cL}" y1="${y.toFixed(1)}" x2="${cR}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4,3"/>
<text x="${(cL - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#94A3B8">${g}.0</text>`
    }).join('\n')

    const barsSvg = yearData.map(({ year, count, avg }, i) => {
      const x = barsStart + i * (barW + barGap)
      const cx = (x + barW / 2).toFixed(1)
      if (avg === null) {
        return `<rect x="${x.toFixed(1)}" y="${(cB - 6).toFixed(1)}" width="${barW}" height="6" fill="#CBD5E1" rx="2"/>
<text x="${cx}" y="${(cB + 16).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748B">${year}</text>
<text x="${cx}" y="${(cB - 10).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#94A3B8">N/A</text>`
      }
      const barTop = toY(avg)
      const barH = cB - barTop
      const fill   = avg >= 3.0 ? '#4ADE80' : avg >= 2.5 ? '#FCD34D' : '#F87171'
      const stroke = avg >= 3.0 ? '#16A34A' : avg >= 2.5 ? '#D97706' : '#DC2626'
      const tf     = avg >= 3.0 ? '#166534' : avg >= 2.5 ? '#92400E' : '#991B1B'
      return `<rect x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" rx="4"/>
<text x="${cx}" y="${(barTop - 7).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="${tf}">${avg.toFixed(2)}</text>
<text x="${cx}" y="${(cB + 16).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#334155">${year}</text>
<text x="${cx}" y="${(cB + 28).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#94A3B8">${count} mbrs</text>`
    }).join('\n')

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#F8FAFC" rx="6"/>
<text x="${W / 2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0F172A">Avg GPA by Class Year</text>
<line x1="${cL}" y1="${cT}" x2="${cL}" y2="${cB}" stroke="#CBD5E1" stroke-width="1.5"/>
<line x1="${cL}" y1="${cB}" x2="${cR}" y2="${cB}" stroke="#CBD5E1" stroke-width="1.5"/>
${gridLines}
${barsSvg}
</svg>`

    return (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')
  } catch {
    return null
  }
}

export async function generateExcel(
  members: Profile[],
  submissions: Submission[],
  semester: Semester,
  rounds?: SemesterRound[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Chapter Grade Portal'
  workbook.created = new Date()

  // Index submissions by member
  const subByMember = new Map<string, Submission>()
  submissions.forEach(s => subByMember.set(s.member_id, s))

  const sorted = [...members].sort((a, b) => {
    const ga = subByMember.get(a.id)?.final_gpa ?? -1
    const gb = subByMember.get(b.id)?.final_gpa ?? -1
    return gb - ga
  })

  // ── Dashboard Sheet ────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('Dashboard')
    ws.columns = [
      { key: 'a', width: 24 },
      { key: 'b', width: 12 },
      { key: 'c', width: 11 },
      { key: 'd', width: 2 },
    ]

    ws.mergeCells('A1:C1')
    const titleCell = ws.getCell('A1')
    titleCell.value = `Chapter Grade Report — ${semester.name}`
    titleCell.font = { bold: true, size: 15, color: { argb: DARK_NAVY } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 34

    ws.mergeCells('A2:C2')
    ws.getCell('A2').value = `Generated: ${new Date().toLocaleString()}  |  Deadline: ${new Date(semester.deadline).toLocaleString()}`
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    ws.getRow(3).height = 8

    // CHAPTER SUMMARY block
    ws.mergeCells('A4:C4')
    ws.getCell('A4').value = 'CHAPTER SUMMARY'
    ws.getCell('A4').font = { bold: true, size: 11, color: { argb: WHITE } }
    ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
    ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(4).height = 22

    const gpas = sorted.map(m => subByMember.get(m.id)?.final_gpa ?? null).filter((g): g is number => g !== null)
    const chapterAvg = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
    const nonSubCount = members.filter(m => !subByMember.has(m.id)).length
    const submittedCount = members.length - nonSubCount
    const pendingCount = submissions.filter(s => s.status === 'pending' && !s.no_grade).length
    const compliancePct = members.length > 0 ? Math.round((submittedCount / members.length) * 100) : 0

    const summaryRows: Array<[string, string | number, string]> = [
      ['Total Members',  members.length,                          ''],
      ['Submitted',      `${submittedCount} / ${members.length}`, `${compliancePct}% compliance`],
      ['Chapter GPA',    chapterAvg !== null ? +chapterAvg.toFixed(2) : '—', gpas.length ? `${gpas.length} graded` : ''],
      ['Pending Review', pendingCount,                            ''],
      ['Not Submitted',  nonSubCount,                             ''],
    ]
    summaryRows.forEach(([label, value, note], i) => {
      const r = ws.getRow(5 + i)
      r.getCell(1).value = label
      r.getCell(1).font = { color: { argb: 'FF334155' }, size: 11 }
      r.getCell(2).value = value as string | number
      r.getCell(2).font = { bold: true, color: { argb: DARK_NAVY }, size: 11 }
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(3).value = note
      r.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } }
      if (i % 2 === 0) [1, 2, 3].forEach(c => { r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } } })
    })
    if (chapterAvg !== null) {
      const gc = ws.getRow(7).getCell(2)
      gc.fill = gpaFill(chapterAvg)!
      gc.font = { bold: true, size: 11, color: { argb: gpaFontColor(chapterAvg) } }
    }
    ws.getRow(10).height = 8

    // GPA DISTRIBUTION block
    ws.mergeCells('A11:C11')
    ws.getCell('A11').value = 'GPA DISTRIBUTION'
    ws.getCell('A11').font = { bold: true, size: 11, color: { argb: WHITE } }
    ws.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
    ws.getCell('A11').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(11).height = 22
    headerRow(ws, ['GPA Range', 'Members', '%'], 12)

    const distBands: Array<{ label: string; min: number; max: number; bg: string; fg: string }> = [
      { label: '3.50 – 4.00   Excellent', min: 3.5, max: 4.01, bg: LIGHT_GREEN,  fg: GREEN },
      { label: '3.00 – 3.49   Good',      min: 3.0, max: 3.5,  bg: LIGHT_GREEN,  fg: GREEN },
      { label: '2.50 – 2.99   Average',   min: 2.5, max: 3.0,  bg: LIGHT_YELLOW, fg: YELLOW },
      { label: '2.00 – 2.49   Below Avg', min: 2.0, max: 2.5,  bg: LIGHT_AMBER,  fg: AMBER_TEXT },
      { label: 'Below 2.00   At Risk',    min: 0,   max: 2.0,  bg: LIGHT_RED,    fg: RED },
      { label: 'Not Submitted',           min: -1,  max: -1,   bg: GREY_BG,      fg: 'FF64748B' },
    ]
    distBands.forEach(({ label, min, max, bg, fg }, i) => {
      const cnt = min < 0 ? nonSubCount : gpas.filter(g => g >= min && g < max).length
      const pct = members.length > 0 ? Math.round((cnt / members.length) * 100) : 0
      const r = ws.getRow(13 + i)
      ;[1, 2, 3].forEach(c => { r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } })
      r.getCell(1).value = label
      r.getCell(1).font = { size: 11, color: { argb: fg } }
      r.getCell(2).value = cnt
      r.getCell(2).font = { bold: true, size: 11, color: { argb: fg } }
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(3).value = `${pct}%`
      r.getCell(3).font = { size: 10, color: { argb: fg } }
      r.getCell(3).alignment = { horizontal: 'center' }
    })
    ws.getRow(19).height = 8

    // GPA BY CLASS YEAR table
    ws.mergeCells('A20:C20')
    ws.getCell('A20').value = 'GPA BY CLASS YEAR'
    ws.getCell('A20').font = { bold: true, size: 11, color: { argb: WHITE } }
    ws.getCell('A20').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
    ws.getCell('A20').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(20).height = 22
    headerRow(ws, ['Class Year', 'Members', 'Avg GPA'], 21)

    const yearData = (['Freshman', 'Sophomore', 'Junior', 'Senior'] as const).map(yr => {
      const yrM = members.filter(m => m.class_year === yr)
      const yrG = yrM.map(m => subByMember.get(m.id)?.final_gpa ?? null).filter((g): g is number => g !== null)
      return { year: yr, count: yrM.length, avg: yrG.length ? yrG.reduce((a, b) => a + b, 0) / yrG.length : null }
    })
    yearData.forEach(({ year, count, avg }, i) => {
      const r = ws.getRow(22 + i)
      r.getCell(1).value = year
      r.getCell(2).value = count
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(3).value = avg !== null ? +avg.toFixed(2) : '—'
      r.getCell(3).alignment = { horizontal: 'center' }
      if (avg !== null) { r.getCell(3).fill = gpaFill(avg)!; r.getCell(3).font = { bold: true, color: { argb: gpaFontColor(avg) } } }
      if (i % 2 === 0) [1, 2].forEach(c => { r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } } })
    })

    // Embedded bar chart in right half
    const chartPng = await buildBarChartPng(yearData)
    if (chartPng) {
      const imgId = workbook.addImage({ base64: chartPng, extension: 'png' })
      ws.addImage(imgId, { tl: { col: 4, row: 2 }, ext: { width: 520, height: 250 } })
      for (let c = 5; c <= 12; c++) ws.getColumn(c).width = 11
    }
  }

  // ── Summary Sheet ──────────────────────────────────────────
  {
    const roundMap = new Map<string, string>()
    rounds?.forEach(r => roundMap.set(r.id, r.name))
    const hasRounds = (rounds?.length ?? 0) > 0

    const ws = workbook.addWorksheet('Summary')
    // Column layout varies based on whether this semester uses rounds
    if (hasRounds) {
      ws.columns = [
        { key: 'name',      width: 24 },
        { key: 'email',     width: 28 },
        { key: 'year',      width: 14 },
        { key: 'round',     width: 14 },
        { key: 'gpa',       width: 10 },
        { key: 'status',    width: 14 },
        { key: 'submitted', width: 22 },
      ]
    } else {
      ws.columns = [
        { key: 'name',      width: 24 },
        { key: 'email',     width: 28 },
        { key: 'year',      width: 14 },
        { key: 'gpa',       width: 10 },
        { key: 'status',    width: 14 },
        { key: 'submitted', width: 22 },
      ]
    }

    const colCount = hasRounds ? 7 : 6
    const lastCol = String.fromCharCode(64 + colCount) // A=65, so col 7 = G

    // Title
    ws.mergeCells(`A1:${lastCol}1`)
    const title = ws.getCell('A1')
    title.value = `Chapter Grade Report — ${semester.name}`
    title.font = { bold: true, size: 14, color: { argb: DARK_NAVY } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } }
    title.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 30

    ws.mergeCells(`A2:${lastCol}2`)
    ws.getCell('A2').value = `Deadline: ${new Date(semester.deadline).toLocaleString()}  |  Generated: ${new Date().toLocaleString()}`
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' }, size: 10 }
    ws.getCell('A2').alignment = { horizontal: 'center' }

    const headers = hasRounds
      ? ['Member Name', 'Email', 'Class Year', 'Round', 'GPA', 'Status', 'Submitted At']
      : ['Member Name', 'Email', 'Class Year', 'GPA', 'Status', 'Submitted At']
    headerRow(ws, headers, 3)

    sorted.forEach((m, i) => {
      const sub = subByMember.get(m.id)
      const gpa = sub?.final_gpa ?? null
      const row = ws.getRow(4 + i)

      if (hasRounds) {
        const roundName = sub?.round_id ? (roundMap.get(sub.round_id) ?? '—') : (sub ? '—' : '')
        row.getCell(1).value = m.full_name
        row.getCell(2).value = m.email
        row.getCell(3).value = m.class_year
        row.getCell(4).value = roundName
        row.getCell(5).value = gpa !== null ? +gpa.toFixed(2) : '—'
        row.getCell(6).value = sub?.status ?? 'Not Submitted'
        row.getCell(7).value = sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '—'
        const gpaCell = row.getCell(5)
        if (gpa !== null) { gpaCell.fill = gpaFill(gpa)!; gpaCell.font = { color: { argb: gpaFontColor(gpa) }, bold: true } }
        gpaCell.alignment = { horizontal: 'center' }
        row.getCell(3).alignment = { horizontal: 'center' }
        row.getCell(4).alignment = { horizontal: 'center' }
        row.getCell(6).alignment = { horizontal: 'center' }
        row.getCell(7).alignment = { horizontal: 'center' }
        if (i % 2 === 0) [1,2,3,4,6,7].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } } })
      } else {
        row.getCell(1).value = m.full_name
        row.getCell(2).value = m.email
        row.getCell(3).value = m.class_year
        row.getCell(4).value = gpa !== null ? +gpa.toFixed(2) : '—'
        row.getCell(5).value = sub?.status ?? 'Not Submitted'
        row.getCell(6).value = sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '—'
        const gpaCell = row.getCell(4)
        if (gpa !== null) { gpaCell.fill = gpaFill(gpa)!; gpaCell.font = { color: { argb: gpaFontColor(gpa) }, bold: true } }
        gpaCell.alignment = { horizontal: 'center' }
        row.getCell(3).alignment = { horizontal: 'center' }
        row.getCell(5).alignment = { horizontal: 'center' }
        row.getCell(6).alignment = { horizontal: 'center' }
        if (i % 2 === 0) [1,2,3,5,6].forEach(c => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } } })
      }
    })

    // Chapter averages footer
    const gpaCol = hasRounds ? 5 : 4
    const gpas = sorted.map(m => subByMember.get(m.id)?.final_gpa ?? null).filter((g): g is number => g !== null)
    const chapterAvg = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null
    const afterData = 4 + sorted.length + 1

    const avgRow = ws.getRow(afterData)
    avgRow.getCell(1).value = 'Chapter Average'
    avgRow.getCell(1).font = { bold: true }
    avgRow.getCell(gpaCol).value = chapterAvg !== null ? +chapterAvg.toFixed(2) : '—'
    avgRow.getCell(gpaCol).font = { bold: true }
    avgRow.getCell(gpaCol).fill = gpaFill(chapterAvg) ?? { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } }

    const years = ['Freshman','Sophomore','Junior','Senior'] as const
    years.forEach((yr, yi) => {
      const yrGpas = sorted
        .filter(m => m.class_year === yr)
        .map(m => subByMember.get(m.id)?.final_gpa ?? null)
        .filter((g): g is number => g !== null)
      const avg = yrGpas.length ? yrGpas.reduce((a,b) => a+b, 0) / yrGpas.length : null
      const r = ws.getRow(afterData + 1 + yi)
      r.getCell(1).value = `${yr} Average`
      r.getCell(1).font = { italic: true }
      r.getCell(gpaCol).value = avg !== null ? +avg.toFixed(2) : '—'
      r.getCell(gpaCol).fill = gpaFill(avg) ?? { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } }
    })

    ws.views = [{ state: 'frozen', ySplit: 3 }]
  }

  // ── By Class Year Sheet ────────────────────────────────────
  {
    const ws = workbook.addWorksheet('By Class Year')
    ws.columns = [{ key: 'name', width: 24 }, { key: 'gpa', width: 10 }, { key: 'status', width: 14 }]
    let currentRow = 1
    const years = ['Freshman','Sophomore','Junior','Senior'] as const

    for (const yr of years) {
      const group = sorted.filter(m => m.class_year === yr)
      ws.mergeCells(`A${currentRow}:C${currentRow}`)
      const hdr = ws.getCell(`A${currentRow}`)
      hdr.value = yr
      hdr.font = { bold: true, size: 13, color: { argb: WHITE } }
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
      hdr.alignment = { horizontal: 'center' }
      ws.getRow(currentRow).height = 22
      currentRow++

      headerRow(ws, ['Name', 'GPA', 'Status'], currentRow)
      currentRow++

      group.forEach((m, i) => {
        const sub = subByMember.get(m.id)
        const gpa = sub?.final_gpa ?? null
        const row = ws.getRow(currentRow + i)
        row.getCell(1).value = m.full_name
        row.getCell(2).value = gpa !== null ? +gpa.toFixed(2) : '—'
        row.getCell(3).value = sub?.status ?? 'Not Submitted'
        if (gpa !== null) {
          row.getCell(2).fill = gpaFill(gpa)!
          row.getCell(2).font = { color: { argb: gpaFontColor(gpa) }, bold: true }
        }
        row.getCell(2).alignment = { horizontal: 'center' }
        row.getCell(3).alignment = { horizontal: 'center' }
      })
      currentRow += group.length

      const yrGpas = group.map(m => subByMember.get(m.id)?.final_gpa ?? null).filter((g): g is number => g !== null)
      const avg = yrGpas.length ? yrGpas.reduce((a,b) => a+b, 0) / yrGpas.length : null
      const avgR = ws.getRow(currentRow)
      avgR.getCell(1).value = `${yr} Avg`
      avgR.getCell(1).font = { bold: true, italic: true }
      avgR.getCell(2).value = avg !== null ? +avg.toFixed(2) : '—'
      avgR.getCell(2).font = { bold: true }
      if (avg !== null) avgR.getCell(2).fill = gpaFill(avg)!
      currentRow += 3
    }
  }

  // ── By Major Sheet ────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('By Major')
    ws.columns = [{ key: 'name', width: 24 }, { key: 'gpa', width: 10 }, { key: 'status', width: 14 }]

    const majorGroups: Map<string, typeof members> = new Map()
    for (const m of sorted) {
      const key = m.major?.trim() || 'No Major Listed'
      if (!majorGroups.has(key)) majorGroups.set(key, [])
      majorGroups.get(key)!.push(m)
    }

    let currentRow = 1
    for (const [major, group] of Array.from(majorGroups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      ws.mergeCells(`A${currentRow}:C${currentRow}`)
      const hdr = ws.getCell(`A${currentRow}`)
      hdr.value = major
      hdr.font = { bold: true, size: 12, color: { argb: WHITE } }
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
      hdr.alignment = { horizontal: 'center' }
      ws.getRow(currentRow).height = 20
      currentRow++

      headerRow(ws, ['Name', 'GPA', 'Status'], currentRow)
      currentRow++

      group.forEach((m: Profile, i: number) => {
        const sub = subByMember.get(m.id)
        const gpa = sub?.final_gpa ?? null
        const row = ws.getRow(currentRow + i)
        row.getCell(1).value = m.full_name
        row.getCell(2).value = gpa !== null ? +gpa.toFixed(2) : '—'
        row.getCell(3).value = sub?.status ?? 'Not Submitted'
        if (gpa !== null) {
          row.getCell(2).fill = gpaFill(gpa)!
          row.getCell(2).font = { color: { argb: gpaFontColor(gpa) }, bold: true }
        }
        row.getCell(2).alignment = { horizontal: 'center' }
        row.getCell(3).alignment = { horizontal: 'center' }
      })
      currentRow += group.length

      const yrGpas = group.map((m: Profile) => subByMember.get(m.id)?.final_gpa ?? null).filter((g: number | null): g is number => g !== null)
      const avg = yrGpas.length ? yrGpas.reduce((a: number, b: number) => a + b, 0) / yrGpas.length : null
      const avgR = ws.getRow(currentRow)
      avgR.getCell(1).value = `${major} Avg (${yrGpas.length}/${group.length} submitted)`
      avgR.getCell(1).font = { bold: true, italic: true }
      avgR.getCell(2).value = avg !== null ? +avg.toFixed(2) : '—'
      avgR.getCell(2).font = { bold: true }
      if (avg !== null) avgR.getCell(2).fill = gpaFill(avg)!
      currentRow += 3
    }
  }

  // ── Individual Member Sheets ───────────────────────────────
  for (const m of members) {
    const sheetName = m.full_name.substring(0, 28).replace(/[*?:/\\[\]]/g, '')
    const ws = workbook.addWorksheet(sheetName)
    ws.columns = [
      { key: 'label',    width: 20 },
      { key: 'value',    width: 30 },
    ]

    // Member info block
    const infoRows = [
      ['Name', m.full_name],
      ['Email', m.email],
      ['Class Year', m.class_year],
      ['Role', m.role],
    ]
    infoRows.forEach(([label, value], i) => {
      ws.getRow(i + 1).getCell(1).value = label
      ws.getRow(i + 1).getCell(1).font = { bold: true, color: { argb: DARK_NAVY } }
      ws.getRow(i + 1).getCell(2).value = value
    })

    ws.getRow(6).getCell(1).value = ''
    headerRow(ws, ['Semester', 'OCR GPA', 'Admin GPA', 'Final GPA', 'Status', 'Submitted', 'Notes'], 7)
    ws.columns = [
      { key: 'semester',   width: 18 },
      { key: 'ocr_gpa',    width: 10 },
      { key: 'admin_gpa',  width: 12 },
      { key: 'final_gpa',  width: 10 },
      { key: 'status',     width: 14 },
      { key: 'submitted',  width: 22 },
      { key: 'notes',      width: 30 },
    ]

    const sub = subByMember.get(m.id)
    if (sub) {
      const r = ws.getRow(8)
      r.getCell(1).value = semester.name
      r.getCell(2).value = sub.ocr_gpa ?? '—'
      r.getCell(3).value = sub.admin_gpa ?? '—'
      r.getCell(4).value = sub.final_gpa ?? '—'
      r.getCell(5).value = sub.status
      r.getCell(6).value = new Date(sub.submitted_at).toLocaleString()
      r.getCell(7).value = sub.admin_notes ?? ''
      if (sub.final_gpa !== null) {
        r.getCell(4).fill = gpaFill(sub.final_gpa)!
        r.getCell(4).font = { bold: true, color: { argb: gpaFontColor(sub.final_gpa) } }
      }
      if (sub.duplicate_flag) {
        r.getCell(2).note = '⚠ Possible duplicate photo detected'
      }
    } else {
      ws.getRow(8).getCell(1).value = 'No submission for this semester'
      ws.getRow(8).getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } }
    }
  }

  // ── By Round Sheet (only when semester has multiple rounds) ─
  if (rounds && rounds.length > 0) {
    const ws = workbook.addWorksheet('By Round')
    ws.columns = [
      { key: 'name', width: 24 }, { key: 'round', width: 16 },
      { key: 'gpa', width: 10 }, { key: 'status', width: 14 },
    ]

    let currentRow = 1
    for (const round of rounds) {
      const roundSubs = submissions.filter(s => s.round_id === round.id)
      const roundSubMap = new Map<string, Submission>()
      roundSubs.forEach(s => roundSubMap.set(s.member_id, s))
      if (roundSubs.length === 0) continue

      ws.mergeCells(`A${currentRow}:D${currentRow}`)
      const hdr = ws.getCell(`A${currentRow}`)
      hdr.value = `${round.name}  —  Deadline: ${new Date(round.deadline).toLocaleDateString()}`
      hdr.font = { bold: true, size: 12, color: { argb: WHITE } }
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } }
      hdr.alignment = { horizontal: 'center' }
      ws.getRow(currentRow).height = 22
      currentRow++

      headerRow(ws, ['Name', 'Round', 'GPA', 'Status'], currentRow)
      currentRow++

      const roundMembers = sorted.filter(m => roundSubMap.has(m.id))
      roundMembers.forEach((m, i) => {
        const sub = roundSubMap.get(m.id)!
        const gpa = sub.final_gpa ?? null
        const row = ws.getRow(currentRow + i)
        row.getCell(1).value = m.full_name
        row.getCell(2).value = round.name
        row.getCell(3).value = gpa !== null ? +gpa.toFixed(2) : sub.no_grade ? 'N/A' : '—'
        row.getCell(4).value = sub.status
        row.getCell(2).alignment = { horizontal: 'center' }
        row.getCell(3).alignment = { horizontal: 'center' }
        row.getCell(4).alignment = { horizontal: 'center' }
        if (gpa !== null) {
          row.getCell(3).fill = gpaFill(gpa)!
          row.getCell(3).font = { color: { argb: gpaFontColor(gpa) }, bold: true }
        }
      })
      currentRow += Math.max(roundMembers.length, 1)

      const roundGpas = roundMembers
        .map(m => roundSubMap.get(m.id)?.final_gpa ?? null)
        .filter((g): g is number => g !== null)
      const avg = roundGpas.length ? roundGpas.reduce((a, b) => a + b, 0) / roundGpas.length : null
      const avgR = ws.getRow(currentRow)
      avgR.getCell(1).value = `${round.name} Avg — ${roundGpas.length}/${roundMembers.length} graded`
      avgR.getCell(1).font = { bold: true, italic: true }
      avgR.getCell(3).value = avg !== null ? +avg.toFixed(2) : '—'
      avgR.getCell(3).font = { bold: true }
      if (avg !== null) avgR.getCell(3).fill = gpaFill(avg)!
      currentRow += 3
    }
  }

  // ── Non-Submitters Sheet ───────────────────────────────────
  {
    const ws = workbook.addWorksheet('Non-Submitters')
    ws.columns = [
      { key: 'name',  width: 24 },
      { key: 'email', width: 28 },
      { key: 'year',  width: 14 },
    ]

    ws.mergeCells('A1:C1')
    ws.getCell('A1').value = `Non-Submitters — ${semester.name}`
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: WHITE } }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
    ws.getCell('A1').alignment = { horizontal: 'center' }

    headerRow(ws, ['Name', 'Email', 'Class Year'], 2)

    const nonSubmitters = members.filter(m => !subByMember.has(m.id))
    nonSubmitters.forEach((m, i) => {
      const row = ws.getRow(3 + i)
      row.getCell(1).value = m.full_name
      row.getCell(2).value = m.email
      row.getCell(3).value = m.class_year
    })

    if (nonSubmitters.length === 0) {
      ws.getRow(3).getCell(1).value = '✅ All members submitted!'
      ws.getRow(3).getCell(1).font = { color: { argb: GREEN }, bold: true }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
