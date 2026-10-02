// Simple CSV parser supporting commas, semicolons, and quoted values
// Re-export intelligent parser utilities
export {
  parseSpreadsheetFile,
  analyzeAndExtractSpreadsheet,
  rawParseCSV,
  rawParseXLSX,
  isBillableValue,
  tryExtractDate,
  type ParsedClientRow,
  type ParseResult,
} from './spreadsheetParser'

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  // Determine delimiter: semicolon or comma
  const firstLine = lines[0]
  const delimiter = firstLine.includes(';') ? ';' : ','

  // Helper to split row respecting double quotes
  const splitRow = (row: string): string[] => {
    const regex = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g')
    const matches: string[] = []
    let match
    while ((match = regex.exec(row)) !== null) {
      // quoted or unquoted
      let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]
      matches.push(val ? val.trim() : '')
      if (regex.lastIndex === 0) break
    }
    return matches
  }

  const headers = splitRow(lines[0]).map((h) => h.replace(/^["'\uFEFF]+|["']+$/g, '').trim())

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i])
    if (cols.length === 0 || cols.every((c) => c === '')) continue
    const rowObj: Record<string, string> = {}
    headers.forEach((header, idx) => {
      rowObj[header] = cols[idx] !== undefined ? cols[idx] : ''
    })
    rows.push(rowObj)
  }

  return rows
}

// Convert number string with pt-BR format (e.g. "1.234,56" or "1234.56" or "R$ 1.234,56") into JS Number
export function parseCurrency(val: any): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  let str = String(val).trim().replace(/R\$/g, '').replace(/\s+/g, '')

  // If format is like 1.234,56 (Brazilian standard)
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}
