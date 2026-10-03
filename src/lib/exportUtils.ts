import { jsPDF } from 'jspdf'
import autoTable, { applyPlugin } from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { SystemSettings } from '@/types/database'

export interface SummaryRow {
  sellerName: string
  role: string
  grossTotal: number
  netTotal: number
  commissionTotal: number
  fixedSalary: number
  totalPayable: number
}

export interface DetailedRow {
  sellerName: string
  competenceMonth: string
  customerCode: string
  customerName: string
  origin: string
  grossAmount: number
  taxesDeducted: number
  taxDetails: string
  netAmount: number
  commissionPct: number
  commissionAmount: number
}

export interface ExportDataPayload {
  viewType: 'summary' | 'detailed'
  periodTitle: string
  companySettings: SystemSettings | null
  summaryRows: SummaryRow[]
  detailedRows: DetailedRow[]
  totals: {
    gross: number
    net: number
    taxes: number
    commissions: number
    fixed: number
    grandTotal: number
  }
}

const formatBRL = (val: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val || 0)
}

// ==========================================
// CSV EXPORT
// ==========================================
export function exportToCSV(payload: ExportDataPayload, filename = 'relatorio_comissoes') {
  let csvContent = '\uFEFF' // BOM for Excel UTF-8 recognition

  const companyName = payload.companySettings?.company_name || 'Globex Multimodal'
  csvContent += `"${companyName}"\n`
  csvContent += `"Relatório de Comissionamento - ${payload.viewType === 'summary' ? 'Visão Resumida' : 'Visão Detalhada'}"\n`
  csvContent += `"Competência/Período: ${payload.periodTitle}"\n`
  csvContent += `"Data de Geração: ${new Date().toLocaleString('pt-BR')}"\n\n`

  if (payload.viewType === 'summary') {
    csvContent += `"Vendedor","Cargo","Bruto Total (R$)","Base Líquida (R$)","Total Comissão (R$)","Fixo (R$)","Total a Pagar (R$)"\n`
    payload.summaryRows.forEach((r) => {
      csvContent += `"${r.sellerName}","${r.role}",${r.grossTotal.toFixed(2)},${r.netTotal.toFixed(2)},${r.commissionTotal.toFixed(2)},${r.fixedSalary.toFixed(2)},${r.totalPayable.toFixed(2)}\n`
    })
    csvContent += `\n"TOTAL CONSOLIDADO","",${payload.totals.gross.toFixed(2)},${payload.totals.net.toFixed(2)},${payload.totals.commissions.toFixed(2)},${payload.totals.fixed.toFixed(2)},${payload.totals.grandTotal.toFixed(2)}\n`
  } else {
    csvContent += `"Vendedor","Mês","Código Cliente","Cliente","Origem","Faturamento Bruto (R$)","Impostos Abatidos (R$)","Detalhamento Tributário","Base Líquida (R$)","% Comissão","Valor Comissão (R$)"\n`
    payload.detailedRows.forEach((r) => {
      csvContent += `"${r.sellerName}","${r.competenceMonth}","${r.customerCode}","${r.customerName}","${r.origin}",${r.grossAmount.toFixed(2)},${r.taxesDeducted.toFixed(2)},"${r.taxDetails}",${r.netAmount.toFixed(2)},${r.commissionPct}%,${r.commissionAmount.toFixed(2)}\n`
    })
    csvContent += `\n"TOTAIS","","","","",${payload.totals.gross.toFixed(2)},${payload.totals.taxes.toFixed(2)},"",${payload.totals.net.toFixed(2)},"",${payload.totals.commissions.toFixed(2)}\n`
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ==========================================
// XLSX EXPORT
// ==========================================
export function exportToXLSX(payload: ExportDataPayload, filename = 'relatorio_comissoes') {
  const wb = XLSX.utils.book_new()
  const companyName = payload.companySettings?.company_name || 'Globex Multimodal'

  if (payload.viewType === 'summary') {
    const data: any[][] = [
      [companyName],
      ['Relatório de Comissionamento B2B - Visão Resumida'],
      [`Competência / Período: ${payload.periodTitle}`],
      [`Data de Extração: ${new Date().toLocaleString('pt-BR')}`],
      [],
      [
        'Vendedor',
        'Cargo',
        'Bruto Total',
        'Base Líquida',
        'Total Comissão',
        'Fixo',
        'Total a Pagar',
      ],
    ]

    payload.summaryRows.forEach((r) => {
      data.push([
        r.sellerName,
        r.role,
        r.grossTotal,
        r.netTotal,
        r.commissionTotal,
        r.fixedSalary,
        r.totalPayable,
      ])
    })

    data.push([])
    data.push([
      'TOTAL CONSOLIDADO',
      '',
      payload.totals.gross,
      payload.totals.net,
      payload.totals.commissions,
      payload.totals.fixed,
      payload.totals.grandTotal,
    ])

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Visao_Resumida')
  } else {
    const data: any[][] = [
      [companyName],
      ['Relatório de Comissionamento B2B - Visão Detalhada por Cliente'],
      [`Competência / Período: ${payload.periodTitle}`],
      [`Data de Extração: ${new Date().toLocaleString('pt-BR')}`],
      [],
      [
        'Vendedor',
        'Competência',
        'Código Cliente',
        'Cliente',
        'Origem',
        'Bruto (R$)',
        'Impostos Abatidos (R$)',
        'Detalhamento Tributário',
        'Líquido (R$)',
        '% Comissão',
        'Comissão Gerada (R$)',
      ],
    ]

    payload.detailedRows.forEach((r) => {
      data.push([
        r.sellerName,
        r.competenceMonth,
        r.customerCode,
        r.customerName,
        r.origin,
        r.grossAmount,
        r.taxesDeducted,
        r.taxDetails,
        r.netAmount,
        `${r.commissionPct}%`,
        r.commissionAmount,
      ])
    })

    data.push([])
    data.push([
      'TOTAIS',
      '',
      '',
      '',
      '',
      payload.totals.gross,
      payload.totals.taxes,
      '',
      payload.totals.net,
      '',
      payload.totals.commissions,
    ])

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 15 },
      { wch: 28 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
      { wch: 16 },
      { wch: 14 },
      { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Visao_Detalhada')
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ==========================================
// PDF EXPORT (jsPDF + jsPDF-autotable)
// ==========================================

// Garante que o plugin autoTable esteja registrado na classe jsPDF para ESM / Vite bundles
try {
  applyPlugin(jsPDF)
} catch {
  // Ignora se já registrado ou em ambiente sem protótipo direto
}

/**
 * Executa autoTable de forma resiliente tanto para standalone function (autoTable / autoTable.default)
 * quanto via protótipo doc.autoTable.
 */
function callAutoTable(doc: jsPDF, options: any) {
  const runner =
    typeof autoTable === 'function'
      ? autoTable
      : (autoTable as any)?.default && typeof (autoTable as any).default === 'function'
        ? (autoTable as any).default
        : typeof (doc as any).autoTable === 'function'
          ? (doc as any).autoTable.bind(doc)
          : null

  if (runner) {
    if (runner === (doc as any).autoTable) {
      runner(options)
    } else {
      runner(doc, options)
    }
    return
  }

  // Fallback caso apenas doc.autoTable exista
  if (typeof (doc as any).autoTable === 'function') {
    ;(doc as any).autoTable(options)
    return
  }

  throw new Error('Plugin jspdf-autotable não pôde ser inicializado')
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0)
        const dataURL = canvas.toDataURL('image/png')
        resolve(dataURL)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export async function exportToPDF(payload: ExportDataPayload, filename = 'relatorio_comissoes') {
  const isLandscape = payload.viewType === 'detailed'
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const companyName = payload.companySettings?.company_name || 'Globex Multimodal'
  const logoUrl = payload.companySettings?.company_logo_url
  const generationDate = new Date().toLocaleString('pt-BR')
  const pageWidth = doc.internal.pageSize.getWidth()

  // 1. Header with logo and company info
  let startY = 15
  let textLeft = 14

  if (logoUrl) {
    try {
      const base64Logo = await loadImageAsBase64(logoUrl)
      if (base64Logo) {
        doc.addImage(base64Logo, 'PNG', 14, 10, 28, 16)
        textLeft = 46
      }
    } catch (e) {
      console.warn('Não foi possível carregar a logo no PDF:', e)
    }
  }

  // Company Name
  doc.setFontSize(14)
  doc.setTextColor(15, 118, 110) // #0F766E
  doc.setFont('helvetica', 'bold')
  doc.text(companyName, textLeft, 16)

  // Report Title
  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85) // slate-700
  doc.setFont('helvetica', 'normal')
  const titleText =
    payload.viewType === 'summary'
      ? 'Relatório de Comissões e Folha de Vendas (Visão Resumida)'
      : 'Demonstrativo Analítico de Comissões por Cliente (Visão Detalhada)'
  doc.text(titleText, textLeft, 22)

  // Metadata: Period & Generation Date (right aligned)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139) // slate-500
  const dateMeta = `Gerado em: ${generationDate}`
  const periodMeta = `Competência / Período: ${payload.periodTitle}`
  doc.text(periodMeta, pageWidth - 14, 16, { align: 'right' })
  doc.text(dateMeta, pageWidth - 14, 21, { align: 'right' })

  // Horizontal divider
  doc.setDrawColor(226, 232, 240) // slate-200
  doc.setLineWidth(0.5)
  doc.line(14, 30, pageWidth - 14, 30)

  // 2. Metrics Highlight Boxes
  startY = 35
  const boxWidth =
    (pageWidth - 28 - (payload.viewType === 'summary' ? 12 : 9)) /
    (payload.viewType === 'summary' ? 4 : 4)
  const boxHeight = 14

  const kpis =
    payload.viewType === 'summary'
      ? [
          { label: 'Bruto Total', val: formatBRL(payload.totals.gross) },
          { label: 'Base Líquida', val: formatBRL(payload.totals.net) },
          { label: 'Comissões', val: formatBRL(payload.totals.commissions) },
          { label: 'Total a Pagar', val: formatBRL(payload.totals.grandTotal) },
        ]
      : [
          { label: 'Faturamento Bruto', val: formatBRL(payload.totals.gross) },
          { label: 'Impostos Abatidos', val: formatBRL(payload.totals.taxes) },
          { label: 'Base Líquida', val: formatBRL(payload.totals.net) },
          { label: 'Total Comissões', val: formatBRL(payload.totals.commissions) },
        ]

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (boxWidth + 3)
    doc.setFillColor(248, 250, 252) // slate-50
    doc.roundedRect(x, startY, boxWidth, boxHeight, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.setFont('helvetica', 'bold')
    doc.text(kpi.label.toUpperCase(), x + 3, startY + 4.5)
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    doc.text(kpi.val, x + 3, startY + 10.5)
  })

  // 3. Main Data Table
  const tableStartY = startY + boxHeight + 6

  if (payload.viewType === 'summary') {
    const headers = [
      [
        'Vendedor',
        'Cargo',
        'Bruto Total',
        'Base Líquida',
        'Total Comissão',
        'Fixo',
        'Total a Pagar',
      ],
    ]
    const body = payload.summaryRows.map((r) => [
      r.sellerName,
      r.role === 'admin' ? 'Administrador' : r.role === 'manager' ? 'Gerente' : 'Vendedor',
      formatBRL(r.grossTotal),
      formatBRL(r.netTotal),
      formatBRL(r.commissionTotal),
      formatBRL(r.fixedSalary),
      formatBRL(r.totalPayable),
    ])

    const foot = [
      [
        'TOTAL CONSOLIDADO',
        '',
        formatBRL(payload.totals.gross),
        formatBRL(payload.totals.net),
        formatBRL(payload.totals.commissions),
        formatBRL(payload.totals.fixed),
        formatBRL(payload.totals.grandTotal),
      ],
    ]

    callAutoTable(doc, {
      startY: tableStartY,
      head: headers,
      body: body,
      foot: foot,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 118, 110], // #0F766E
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'left',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold', textColor: [15, 118, 110] },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    })
  } else {
    // Detailed View Table
    const headers = [
      [
        'Vendedor',
        'Competência',
        'Cód.',
        'Cliente',
        'Origem',
        'Bruto',
        'Impostos Abatidos',
        'Líquido',
        '% Com.',
        'Comissão',
      ],
    ]

    const body = payload.detailedRows.map((r) => [
      r.sellerName,
      r.competenceMonth,
      r.customerCode,
      r.customerName,
      r.origin.toUpperCase(),
      formatBRL(r.grossAmount),
      formatBRL(r.taxesDeducted),
      formatBRL(r.netAmount),
      `${r.commissionPct}%`,
      formatBRL(r.commissionAmount),
    ])

    const foot = [
      [
        'TOTAIS',
        '',
        '',
        '',
        '',
        formatBRL(payload.totals.gross),
        formatBRL(payload.totals.taxes),
        formatBRL(payload.totals.net),
        '',
        formatBRL(payload.totals.commissions),
      ],
    ]

    callAutoTable(doc, {
      startY: tableStartY,
      head: headers,
      body: body,
      foot: foot,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 32 },
        1: { cellWidth: 26 },
        2: { cellWidth: 16 },
        3: { cellWidth: 46 },
        4: { cellWidth: 18, halign: 'center' },
        5: { halign: 'right', cellWidth: 26 },
        6: { halign: 'right', cellWidth: 26, textColor: [185, 28, 28] },
        7: { halign: 'right', cellWidth: 26 },
        8: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
        9: { halign: 'right', cellWidth: 28, fontStyle: 'bold', textColor: [15, 118, 110] },
      },
      margin: { left: 14, right: 14 },
    })
  }

  // 4. Footer with page numbering
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Página ${i} de ${pageCount} — Relatório de Conformidade B2B ${companyName}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 7,
      { align: 'center' },
    )
  }

  doc.save(`${filename}.pdf`)
}
