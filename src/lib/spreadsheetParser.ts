/**
 * Spreadsheet Parser Inteligente e Adaptativo
 * Suporta formatos CSV e XLSX (tabelas dinâmicas, formatos tradicionais e relatórios com cabeçalhos deslocados).
 *
 * Atende aos requisitos:
 * 1. Detecção automática de cabeçalho por heurística/palavras-chave (case-insensitive, sem acentos).
 * 2. Suporte a datas no cabeçalho ou nas linhas de sumário prévias para extração do mês de referência.
 * 3. Heurística de fallback caso não encontre cabeçalhos padronizados.
 * 4. Descarte de linhas de sumário ("Total Geral", "Soma", etc.), linhas vazias e linhas sem valor (blank/dash).
 * 5. Valor 0 é um valor válido de faturamento.
 * 6. Relatório estatístico completo da validação para feedback ao usuário.
 */

// Helper to remove accents and normalize strings for matching
export function normalizeStr(str: any): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Convert string/number into JS Number handling pt-BR ("1.234,56") and standard ("1234.56")
export function parseCurrency(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val
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

// Check whether a cell value represents a numeric/billable value (including 0)
// Empty, whitespace, "—", "-", "n/a", null, undefined are non-billable
export function isBillableValue(val: any): boolean {
  if (val === null || val === undefined) return false
  if (typeof val === 'number') return !isNaN(val)
  const s = String(val).trim()
  if (
    s === '' ||
    s === '—' ||
    s === '-' ||
    s === '–' ||
    s === 'null' ||
    s === 'undefined' ||
    s === 'N/A'
  ) {
    return false
  }
  // Try parsing
  const clean = s.replace(/R\$/g, '').replace(/\s+/g, '')
  if (clean === '') return false
  // Check if string has digits
  if (!/\d/.test(clean)) return false
  const parsed = parseCurrency(s)
  return !isNaN(parsed)
}

// Date detector: matches Date object, or parseable date string, or ISO string
export function tryExtractDate(val: any): Date | null {
  if (!val) return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val
  }
  const s = String(val).trim()
  if (!s) return null

  // Check Excel serial number (around 40000 - 60000 for years 2010 - 2064)
  if (typeof val === 'number' && val > 30000 && val < 70000) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    if (!isNaN(date.getTime())) return date
  }

  // Common Date patterns:
  // "Tue Sep 01 2026 00:00:00 GMT+0000..." or "2026-09-01" or "01/09/2026" or "09/2026"
  if (/^\d{4}-\d{2}(-\d{2})?/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d
  }

  const ptBrMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (ptBrMatch) {
    const day = parseInt(ptBrMatch[1], 10)
    const month = parseInt(ptBrMatch[2], 10) - 1
    const year = parseInt(ptBrMatch[3].length === 2 ? '20' + ptBrMatch[3] : ptBrMatch[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }

  const monthYearMatch = s.match(/^(\d{1,2})[/-](\d{4})$/)
  if (monthYearMatch) {
    const month = parseInt(monthYearMatch[1], 10) - 1
    const year = parseInt(monthYearMatch[2], 10)
    const d = new Date(year, month, 1)
    if (!isNaN(d.getTime())) return d
  }

  // Attempt standard Date.parse
  const timestamp = Date.parse(s)
  if (
    !isNaN(timestamp) &&
    (s.includes('GMT') ||
      s.includes('UTC') ||
      s.includes('T') ||
      s.includes('-') ||
      s.includes('/'))
  ) {
    const d = new Date(timestamp)
    if (d.getFullYear() > 2000 && d.getFullYear() < 2100) return d
  }

  return null
}

export function formatDateToMonthInput(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Summary labels to ignore
const SUMMARY_LABELS = [
  'total geral',
  'total',
  'totais',
  'soma de valor',
  'soma',
  'sum',
  'subtotal',
  'grand total',
]

export function isSummaryCell(val: any): boolean {
  const norm = normalizeStr(val)
  if (!norm) return false
  return SUMMARY_LABELS.some(
    (lbl) => norm === lbl || norm.startsWith('total') || norm.startsWith('soma'),
  )
}

export interface ParsedClientRow {
  code: string
  name: string
  grossAmount: number
  originalIndex: number
}

export interface ColumnMapping {
  codeColIdx: number
  nameColIdx: number
  amountColIdx: number
  codeColName: string
  nameColName: string
  amountColName: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ParseResult {
  success: boolean
  error?: string
  rows: ParsedClientRow[]
  columnsDetected?: {
    code: string
    name: string
    amount: string
  }
  suggestedMonth?: string // Format "YYYY-MM"
  stats: {
    totalRawRows: number
    recognizedDataRows: number
    importedRows: number
    ignoredEmptyValueRows: number
    ignoredSummaryRows: number
    ignoredHeaderOrPreRows: number
  }
}

/**
 * Dynamically load SheetJS (XLSX) from CDN if not already loaded in window
 */
let xlsxLoadingPromise: Promise<any> | null = null

export async function loadSheetJS(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).XLSX) {
    return (window as any).XLSX
  }

  if (xlsxLoadingPromise) return xlsxLoadingPromise

  xlsxLoadingPromise = new Promise((resolve, reject) => {
    // Try cdnjs first, then sheetjs official cdn as fallback
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    script.async = true
    script.onload = () => {
      if ((window as any).XLSX) {
        resolve((window as any).XLSX)
      } else {
        reject(new Error('SheetJS script loaded but XLSX not found on window'))
      }
    }
    script.onerror = () => {
      // Fallback
      const fallbackScript = document.createElement('script')
      fallbackScript.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
      fallbackScript.async = true
      fallbackScript.onload = () => {
        if ((window as any).XLSX) {
          resolve((window as any).XLSX)
        } else {
          reject(new Error('Falha ao carregar biblioteca de leitura de Excel'))
        }
      }
      fallbackScript.onerror = () => {
        reject(
          new Error('Não foi possível carregar o motor de leitura XLSX. Verifique sua conexão.'),
        )
      }
      document.head.appendChild(fallbackScript)
    }
    document.head.appendChild(script)
  })

  return xlsxLoadingPromise
}

/**
 * Parse CSV text into a 2D array of raw values (rows x columns)
 */
export function rawParseCSV(text: string): any[][] {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0) return []

  // Check delimiter on non-empty line
  const sampleLine = lines.find((l) => l.trim().length > 0) || ''
  const delimiter = sampleLine.includes(';') ? ';' : ','

  const splitRow = (row: string): string[] => {
    const regex = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g')
    const matches: string[] = []
    let match
    while ((match = regex.exec(row)) !== null) {
      let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]
      matches.push(val !== undefined ? val.trim() : '')
      if (regex.lastIndex === 0) break
    }
    return matches
  }

  return lines.map((l) => splitRow(l))
}

/**
 * Read raw matrix from an XLSX/XLS File
 */
export async function rawParseXLSX(file: File): Promise<any[][]> {
  const XLSX = await loadSheetJS()
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Nenhuma planilha encontrada no arquivo Excel.')
  }

  // Use the first sheet or the active sheet
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]

  // Convert to 2D array: header: 1 produces array of arrays, defval: ''
  const matrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
    raw: true,
  })

  return matrix
}

/**
 * Intelligent Grid Analyzer & Extractor
 */
export function analyzeAndExtractSpreadsheet(matrix: any[][]): ParseResult {
  const stats = {
    totalRawRows: matrix.length,
    recognizedDataRows: 0,
    importedRows: 0,
    ignoredEmptyValueRows: 0,
    ignoredSummaryRows: 0,
    ignoredHeaderOrPreRows: 0,
  }

  if (matrix.length === 0) {
    return {
      success: false,
      error: 'O arquivo está vazio ou não contém dados válidos.',
      rows: [],
      stats,
    }
  }

  // 1. Search for potential reference month / date in the pre-header rows (first 10 rows)
  let suggestedMonth: string | undefined = undefined
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const row = matrix[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const cellVal = row[c]
      const parsedDate = tryExtractDate(cellVal)
      if (parsedDate && !suggestedMonth) {
        suggestedMonth = formatDateToMonthInput(parsedDate)
      }
    }
  }

  // Also check if any cell next to a label "Data" has the date
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const row = matrix[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const norm = normalizeStr(row[c])
      if (norm === 'data' || norm.includes('referencia') || norm.includes('mes')) {
        // Check adjacent cells (next col or row below)
        const nextCol = row[c + 1]
        const below = matrix[r + 1]?.[c]
        const d1 = tryExtractDate(nextCol)
        const d2 = tryExtractDate(below)
        if (d1) suggestedMonth = formatDateToMonthInput(d1)
        else if (d2) suggestedMonth = formatDateToMonthInput(d2)
      }
    }
  }

  // 2. Identify Header Row by scoring keywords
  // Heuristic keywords:
  // Code: "código", "codigo", "cod", "id"
  // Name: "cliente", "nome", "razão", "razao", "nome do cliente", "empresa"
  // Amount / Value: "valor", "faturado", "total", or Date object / date-like header
  let headerRowIndex = -1
  let bestHeaderScore = 0
  let detectedMapping: ColumnMapping | null = null

  // Search through first 15 rows for the best header row
  const maxSearchHeader = Math.min(matrix.length, 15)

  for (let r = 0; r < maxSearchHeader; r++) {
    const row = matrix[r]
    if (!row || row.length < 2) continue

    let codeIdx = -1
    let nameIdx = -1
    let amountIdx = -1
    let codeName = ''
    let nameName = ''
    let amountName = ''
    let score = 0

    // Evaluate each column in row
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      const norm = normalizeStr(cell)
      const dateVal = tryExtractDate(cell)

      // Code match: "código", "codigo", "cod", "id do cliente", "id", "código do cliente"
      const isCode =
        norm.includes('codigo') ||
        norm.includes('cod.') ||
        norm.startsWith('cod ') ||
        norm === 'cod' ||
        norm.includes('id do cliente') ||
        norm === 'id' ||
        norm === 'cliente id'

      if (isCode) {
        codeIdx = c
        codeName = String(cell || `Coluna ${c + 1}`)
        score += 4
        continue
      }

      // Name match: "cliente", "nome", "razão", "razao", "empresa" (when not already code)
      const isName =
        !isCode &&
        (norm === 'cliente' ||
          norm.includes('nome do cliente') ||
          norm.includes('nome') ||
          norm.includes('razao social') ||
          norm.includes('razao') ||
          norm.includes('empresa') ||
          (norm.includes('cliente') && !norm.includes('total')))

      if (isName && nameIdx === -1) {
        nameIdx = c
        nameName = String(cell || `Coluna ${c + 1}`)
        score += 4
        continue
      }

      // Amount match:
      // Priority 1: Date in header (pivot table month column)
      // Priority 2: "faturado", "valor", "faturamento"
      // Priority 3: "total" / "total geral" (only if no dedicated date/value column chosen yet)
      if (dateVal !== null) {
        amountIdx = c
        amountName = dateVal instanceof Date ? dateVal.toLocaleDateString('pt-BR') : String(cell)
        score += 5
      } else if (
        norm.includes('faturado') ||
        norm.includes('faturamento') ||
        norm.includes('valor')
      ) {
        // If current amountIdx was not a date, prefer this over a generic total
        amountIdx = c
        amountName = String(cell || `Coluna ${c + 1}`)
        score += 4
      } else if (norm.includes('total') && amountIdx === -1) {
        amountIdx = c
        amountName = String(cell || `Coluna ${c + 1}`)
        score += 1
      }
    }

    if (codeIdx !== -1 && nameIdx !== -1 && amountIdx !== -1 && score > bestHeaderScore) {
      bestHeaderScore = score
      headerRowIndex = r
      detectedMapping = {
        codeColIdx: codeIdx,
        nameColIdx: nameIdx,
        amountColIdx: amountIdx,
        codeColName: codeName,
        nameColName: nameName,
        amountColName: amountName,
        confidence: 'high',
      }
    }
  }

  // If high confidence header not found, check partial matches (e.g. only 2 matched or legacy format)
  if (!detectedMapping) {
    for (let r = 0; r < maxSearchHeader; r++) {
      const row = matrix[r]
      let codeIdx = -1
      let nameIdx = -1
      let amountIdx = -1
      let score = 0

      for (let c = 0; c < row.length; c++) {
        const norm = normalizeStr(row[c])
        if (norm.includes('cliente') && codeIdx === -1 && !norm.includes('nome')) {
          codeIdx = c
          score++
        } else if (norm.includes('nome') || norm.includes('cliente')) {
          nameIdx = c
          score++
        } else if (norm.includes('valor') || norm.includes('faturado') || norm.includes('total')) {
          amountIdx = c
          score++
        }
      }

      if (codeIdx !== -1 && (nameIdx !== -1 || amountIdx !== -1) && score > bestHeaderScore) {
        bestHeaderScore = score
        headerRowIndex = r
        detectedMapping = {
          codeColIdx: codeIdx,
          nameColIdx: nameIdx !== -1 ? nameIdx : 1,
          amountColIdx: amountIdx !== -1 ? amountIdx : 2,
          codeColName: String(row[codeIdx] || 'Código'),
          nameColName: String(row[nameIdx !== -1 ? nameIdx : 1] || 'Nome'),
          amountColName: String(row[amountIdx !== -1 ? amountIdx : 2] || 'Valor'),
          confidence: 'medium',
        }
      }
    }
  }

  // 3. Fallback Heuristic: Infer columns by examining the shapes of data rows
  if (!detectedMapping) {
    // Scan candidate rows starting after row 0 or 1
    const startRow = Math.min(matrix.length - 1, 2)
    const maxCols = Math.max(...matrix.slice(0, 10).map((r) => r.length), 0)

    if (maxCols >= 3) {
      let bestCodeCol = -1
      let bestNameCol = -1
      let bestAmountCol = -1

      // Examine sample rows
      const sampleRows = matrix.slice(startRow, Math.min(matrix.length, startRow + 20))

      // Check each column
      for (let c = 0; c < maxCols; c++) {
        let codePatternCount = 0
        let avgTextLength = 0
        let numericCount = 0
        let textCount = 0

        for (const row of sampleRows) {
          const val = row[c]
          if (val === undefined || val === null || String(val).trim() === '') continue
          const s = String(val).trim()

          // Code pattern: typically short string with letters + numbers (e.g. C00001, CLI-1001, etc.)
          if (/^[a-zA-Z0-9_-]{2,15}$/.test(s) && /[0-9]/.test(s)) {
            codePatternCount++
          }

          // Numeric
          if (typeof val === 'number' || (!isNaN(parseCurrency(val)) && /\d/.test(s))) {
            numericCount++
          }

          if (typeof val === 'string' && s.length > 3) {
            textCount++
            avgTextLength += s.length
          }
        }

        if (codePatternCount >= sampleRows.length * 0.4 && bestCodeCol === -1) {
          bestCodeCol = c
        } else if (numericCount >= sampleRows.length * 0.4) {
          // Prefer first numeric column as amount
          if (bestAmountCol === -1) {
            bestAmountCol = c
          }
        } else if (
          textCount >= sampleRows.length * 0.4 &&
          (bestNameCol === -1 || avgTextLength > 10)
        ) {
          bestNameCol = c
        }
      }

      if (bestCodeCol !== -1 && bestAmountCol !== -1) {
        headerRowIndex = startRow > 0 ? startRow - 1 : 0
        detectedMapping = {
          codeColIdx: bestCodeCol,
          nameColIdx: bestNameCol !== -1 ? bestNameCol : bestCodeCol === 0 ? 1 : 0,
          amountColIdx: bestAmountCol,
          codeColName: 'Código (inferido)',
          nameColName: 'Cliente (inferido)',
          amountColName: 'Valor (inferido)',
          confidence: 'low',
        }
      }
    }
  }

  // If still no mapping could be determined, return friendly error
  if (!detectedMapping) {
    return {
      success: false,
      error:
        'Não foi possível identificar o layout da planilha automaticamente. Verifique se o arquivo possui colunas com código do cliente, nome e valores de faturamento.',
      rows: [],
      stats,
    }
  }

  // 4. Extract data rows
  const dataStartRow = headerRowIndex + 1
  stats.ignoredHeaderOrPreRows = dataStartRow

  const extractedRows: ParsedClientRow[] = []

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r]
    if (!row || row.length === 0) {
      continue
    }

    const rawCode = row[detectedMapping.codeColIdx]
    const rawName = row[detectedMapping.nameColIdx]
    const rawAmount = row[detectedMapping.amountColIdx]

    // Empty line check
    const isRowCompletelyEmpty = row.every(
      (c) => c === undefined || c === null || String(c).trim() === '',
    )
    if (isRowCompletelyEmpty) {
      continue
    }

    // Check if code cell is a summary row ("Total Geral", "Soma", etc.)
    if (isSummaryCell(rawCode) || isSummaryCell(rawName)) {
      stats.ignoredSummaryRows++
      continue
    }

    const codeStr = String(rawCode || '').trim()
    const nameStr = String(rawName || '').trim()

    // If code is empty, check if other cells indicate an unformatted row
    if (!codeStr) {
      // If entire row has no code, ignore as non-client line
      if (isBillableValue(rawAmount)) {
        // might be summary row without code
        stats.ignoredSummaryRows++
      }
      continue
    }

    // This is a recognized client data row!
    stats.recognizedDataRows++

    // Requirement 4: Tratamento de valores
    // célula vazia, "—" ou não numérica na coluna de valor -> linha sem faturamento no mês
    // Decisão de produto: linhas com valor vazio devem ser IGNORADAS, reportadas como "linhas ignoradas (sem valor)"
    // Valor 0 DEVE ser importado normalmente (cliente faturou zero).
    if (!isBillableValue(rawAmount)) {
      stats.ignoredEmptyValueRows++
      continue
    }

    const gross = parseCurrency(rawAmount)

    extractedRows.push({
      code: codeStr,
      name: nameStr || `Cliente ${codeStr}`,
      grossAmount: gross,
      originalIndex: r,
    })
    stats.importedRows++
  }

  if (extractedRows.length === 0 && stats.recognizedDataRows === 0) {
    return {
      success: false,
      error:
        'Nenhuma linha de cliente válida foi encontrada na planilha. Verifique se as colunas estão corretas.',
      rows: [],
      columnsDetected: {
        code: detectedMapping.codeColName,
        name: detectedMapping.nameColName,
        amount: detectedMapping.amountColName,
      },
      suggestedMonth,
      stats,
    }
  }

  return {
    success: true,
    rows: extractedRows,
    columnsDetected: {
      code: detectedMapping.codeColName,
      name: detectedMapping.nameColName,
      amount: detectedMapping.amountColName,
    },
    suggestedMonth,
    stats,
  }
}

/**
 * Universal file parser for the Upload workflow.
 * Takes raw File (.csv, .xlsx, .xls) and runs adaptive extraction.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase()
  let matrix: any[][] = []

  try {
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      matrix = await rawParseXLSX(file)
    } else {
      // Default to CSV
      const text = await file.text()
      matrix = rawParseCSV(text)
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Erro ao abrir o arquivo: ${err.message || 'Formato inválido ou corrompido.'}`,
      rows: [],
      stats: {
        totalRawRows: 0,
        recognizedDataRows: 0,
        importedRows: 0,
        ignoredEmptyValueRows: 0,
        ignoredSummaryRows: 0,
        ignoredHeaderOrPreRows: 0,
      },
    }
  }

  return analyzeAndExtractSpreadsheet(matrix)
}
