import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  getMonthlyRunByMonth,
  createMonthlyRun,
  upsertCustomerByCode,
  createBillingsBatch,
} from '@/services/commissionService'
import {
  parseSpreadsheetFile,
  parseCurrency,
  type ParsedClientRow,
  type ParseResult,
} from '@/lib/spreadsheetParser'
import { useToast } from '@/hooks/use-toast'
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Calendar,
  DollarSign,
  ArrowRight,
  Info,
  Layers,
  Check,
  FileCheck2,
  Sparkles,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export default function Upload() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const now = new Date()
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr)
  const [globalBilling, setGlobalBilling] = useState<string>('')
  const [detectedBilling, setDetectedBilling] = useState<number | null>(null)
  const [existingRunError, setExistingRunError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedClientRow[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Check if month already exists
  useEffect(() => {
    async function checkMonth() {
      if (!selectedMonth) return
      try {
        const existing = await getMonthlyRunByMonth(selectedMonth)
        if (existing) {
          const statusLabel =
            existing.status === 'paid'
              ? 'Mês Fechado / Pago (Bloqueado)'
              : existing.status === 'processed'
                ? 'Processado'
                : 'Pendente'
          setExistingRunError(
            `O mês de ${selectedMonth} já foi iniciado com status "${statusLabel}".`,
          )
        } else {
          setExistingRunError(null)
        }
      } catch (e) {
        console.error(e)
      }
    }
    checkMonth()
  }, [selectedMonth])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    await processFile(selected)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files?.[0]
    if (!droppedFile) return
    await processFile(droppedFile)
  }

  const processFile = async (rawFile: File) => {
    setFile(rawFile)
    setHeaderError(null)
    setParsedRows([])
    setParseResult(null)
    setDetectedBilling(null)
    setParsing(true)

    try {
      const result = await parseSpreadsheetFile(rawFile)
      setParseResult(result)

      if (!result.success || result.rows.length === 0) {
        setHeaderError(
          result.error ||
            'Não foi possível extrair dados válidos da planilha. Verifique se o arquivo possui colunas com código do cliente, nome e valores.',
        )
        toast({
          title: 'Atenção ao analisar planilha',
          description:
            result.error ||
            'Layout não reconhecido com segurança. Por favor, verifique a planilha.',
          variant: 'destructive',
        })
        return
      }

      setParsedRows(result.rows)

      // Detect gross company billing from summary row ("Total Geral")
      if (result.detectedGrossTotal !== undefined && result.detectedGrossTotal > 0) {
        setDetectedBilling(result.detectedGrossTotal)
        setGlobalBilling(
          new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(result.detectedGrossTotal),
        )
      } else {
        setDetectedBilling(null)
      }

      // Suggest month if detected in spreadsheet title/header
      if (result.suggestedMonth) {
        setSelectedMonth(result.suggestedMonth)
        toast({
          title: 'Planilha Analisada com Sucesso',
          description: `Mês de referência detectado como ${result.suggestedMonth}.${
            result.detectedGrossTotal
              ? ` Faturamento total detectado: ${new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                }).format(result.detectedGrossTotal)}.`
              : ''
          }`,
        })
      } else {
        toast({
          title: 'Planilha Analisada com Sucesso',
          description: `${result.stats.importedRows} clientes prontos para importação.${
            result.detectedGrossTotal
              ? ` Faturamento total: ${new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                }).format(result.detectedGrossTotal)}.`
              : ''
          }`,
        })
      }
    } catch (err: any) {
      console.error(err)
      setHeaderError(err.message || 'Falha ao processar arquivo.')
      toast({
        title: 'Erro ao ler arquivo',
        description: err.message || 'Formato inválido. Use .xlsx ou .csv.',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (existingRunError) {
      toast({
        title: 'Mês já cadastrado',
        description: 'Não é possível duplicar o fechamento de um mesmo mês.',
        variant: 'destructive',
      })
      return
    }

    if (!parsedRows || parsedRows.length === 0) {
      toast({
        title: 'Nenhuma linha para importar',
        description: 'Faça o upload de uma planilha com dados válidos antes de prosseguir.',
        variant: 'destructive',
      })
      return
    }

    // Priority: detected billing from file summary, fallback to manual input or sum of rows
    const effectiveGlobalBilling =
      detectedBilling !== null && detectedBilling > 0
        ? detectedBilling
        : parseCurrency(globalBilling)

    if (effectiveGlobalBilling <= 0) {
      toast({
        title: 'Faturamento Bruto Não Informado',
        description:
          'Não foi possível detectar o total no arquivo e nenhum valor manual foi inserido.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      // 1. Create monthly run (pending)
      const newRun = await createMonthlyRun(selectedMonth, effectiveGlobalBilling)

      // 2. Upsert customers and accumulate billings
      const billingsPayload: Array<{
        monthly_run_id: string
        customer_id: string
        gross_amount: number
      }> = []

      for (const row of parsedRows) {
        const code = row.code.trim()
        const name = row.name.trim()
        const gross = row.grossAmount

        if (!code) continue

        // Upsert customer by customer_code exclusively
        const cust = await upsertCustomerByCode(code, name || `Cliente ${code}`)

        billingsPayload.push({
          monthly_run_id: newRun.id,
          customer_id: cust.id,
          gross_amount: gross,
        })
      }

      // 3. Insert billings batch
      if (billingsPayload.length > 0) {
        await createBillingsBatch(billingsPayload)
      }

      toast({
        title: 'Upload Realizado com Sucesso!',
        description: `${billingsPayload.length} faturamentos importados. Redirecionando para o Gatekeeper de Pendências...`,
      })

      // 4. Redirect to /pendencies
      navigate('/pendencies')
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao processar lote',
        description: err.message || 'Falha ao salvar no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const loadSampleTemplate = () => {
    const csvContent =
      'ID do Cliente,Nome do Cliente,Valor Faturado\n' +
      'CLI-1001,TechLog Transportes S.A.,95000.00\n' +
      'CLI-1002,Varejo Global Brasil Ltda,135000.00\n' +
      'CLI-1003,BioPharma Distribuidora,72000.00\n' +
      'CLI-2005,Indústria Metalúrgica Progresso,110000.00\n' +
      'CLI-2006,Rede Supermercados Estrela,45000.00\n' +
      'CLI-2007,InovaTech Cloud Solutions,88000.00\n' +
      'Total Geral,,545000.00\n'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const sampleFile = new File([blob], 'modelo_faturamento_comissoes.csv', { type: 'text/csv' })
    processFile(sampleFile)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Upload Mensal de Faturamento
        </h2>
        <p className="text-sm text-slate-500">
          Carregue o arquivo com o faturamento bruto dos clientes para iniciar a apuração e
          auditoria de pendências.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Existing Run Warning */}
        {existingRunError && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">{existingRunError}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Este mês já possui registro. Se houver pendências, você pode gerenciá-las
                  diretamente.
                </p>
              </div>
            </div>
            <Link
              to="/pendencies"
              className="text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-200 px-3 py-1.5 rounded-lg shrink-0 flex items-center gap-1"
            >
              Ver Pendências
            </Link>
          </div>
        )}

        {/* Step 1: Month and Global Gross Billing */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-teal-100 text-[#0F766E] flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>Parâmetros do Fechamento</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Defina o mês de apuração. O faturamento bruto total da empresa (GLOBAL_BILLING) é
              extraído automaticamente do arquivo anexado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="month"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Mês de Referência
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="month"
                  type="month"
                  required
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="pl-9 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="global"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between"
              >
                <span>Faturamento Bruto da Empresa no Mês (GLOBAL_BILLING)</span>
                {detectedBilling !== null && detectedBilling > 0 ? (
                  <Badge
                    variant="outline"
                    className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px] font-medium"
                  >
                    Detectado do Arquivo
                  </Badge>
                ) : (
                  <span className="text-[10px] text-slate-400 font-normal">Automático</span>
                )}
              </Label>

              {detectedBilling !== null && detectedBilling > 0 ? (
                <div className="flex items-center justify-between h-10 px-3 rounded-md bg-emerald-50/60 border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-slate-600 font-medium">
                      Detectado no arquivo:
                    </span>
                  </div>
                  <span className="text-sm font-bold text-emerald-900 tabular-nums">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(detectedBilling)}
                  </span>
                </div>
              ) : file && parseResult && parseResult.success ? (
                /* Planilha analisada mas sem linha de total geral: exibir fallback manual */
                <div className="space-y-1">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">
                      R$
                    </span>
                    <Input
                      id="global"
                      type="text"
                      placeholder="Ex: 500.000,00"
                      value={globalBilling}
                      onChange={(e) => setGlobalBilling(e.target.value)}
                      className="pl-9 h-10 border-amber-300 focus-visible:ring-amber-500 font-medium tabular-nums bg-amber-50/30"
                    />
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Nenhum "Total Geral" detectado na planilha. Insira o faturamento bruto
                    manualmente.
                  </p>
                </div>
              ) : (
                /* Arquivo ainda não carregado */
                <div className="flex items-center h-10 px-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-400 italic">
                  Será extraído automaticamente do Total Geral da planilha
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Alimenta a variável <code className="text-[#0F766E] font-bold">GLOBAL_BILLING</code>{' '}
                nas fórmulas tributárias.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: File Dropzone */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-teal-100 text-[#0F766E] flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Planilha de Faturamento por Cliente</span>
                <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  <Sparkles className="h-3 w-3" />
                  Parser Inteligente &amp; Adaptativo
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Suporta tabelas dinâmicas do Excel (.xlsx), relatórios gerenciais e planilhas
                tradicionais (.csv). Detecta colunas, cabeçalhos, somas e mês de referência
                automaticamente.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadSampleTemplate}
              className="text-xs border-dashed border-teal-600 text-teal-700 hover:bg-teal-50 shrink-0"
            >
              Usar Modelo de Teste
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 hover:border-[#0F766E] rounded-xl p-8 text-center bg-slate-50/50 hover:bg-teal-50/20 transition-all cursor-pointer group"
              onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <input
                id="file-upload-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-slate-100 group-hover:bg-[#0F766E] group-hover:text-white text-slate-500 flex items-center justify-center transition-colors">
                  {parsing ? (
                    <div className="h-6 w-6 rounded-full border-2 border-[#0F766E] border-t-transparent animate-spin" />
                  ) : (
                    <UploadIcon className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {parsing
                      ? 'Analisando layout da planilha...'
                      : file
                        ? file.name
                        : 'Clique para selecionar ou arraste o arquivo aqui'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Formatos aceitos: Excel (.xlsx, .xls) ou Texto (.csv)
                  </p>
                </div>
              </div>
            </div>

            {headerError && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-semibold">{headerError}</p>
                  <p className="text-rose-600 mt-0.5">
                    Certifique-se de que o arquivo contenha ao menos uma coluna com o código do
                    cliente (ex: C0001, CLI-10), uma coluna com o nome/razão social e uma coluna de
                    valor faturado (ou data de competência).
                  </p>
                </div>
              </div>
            )}

            {/* Resumo da Validação e Auditoria do Parser */}
            {parseResult && parseResult.success && (
              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-[#0F766E]" />
                      <span className="font-bold text-slate-800 text-sm">
                        Resumo da Validação Inteligente
                      </span>
                    </div>
                    {parseResult.columnsDetected && (
                      <span className="text-[11px] text-slate-500">
                        Colunas mapeadas:{' '}
                        <strong className="text-slate-700">
                          {parseResult.columnsDetected.code}
                        </strong>{' '}
                        (código),{' '}
                        <strong className="text-slate-700">
                          {parseResult.columnsDetected.name}
                        </strong>{' '}
                        (nome),{' '}
                        <strong className="text-slate-700">
                          {parseResult.columnsDetected.amount}
                        </strong>{' '}
                        (valor)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-500 block text-[11px]">
                        Clientes Reconhecidos
                      </span>
                      <span className="text-base font-bold text-slate-800 tabular-nums">
                        {parseResult.stats.recognizedDataRows}
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-xs">
                      <span className="text-emerald-700 font-medium block text-[11px]">
                        A Importar (com valor/0)
                      </span>
                      <span className="text-base font-bold text-emerald-700 tabular-nums">
                        {parseResult.stats.importedRows}
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-500 block text-[11px]">
                        Linhas Ignoradas (sem valor)
                      </span>
                      <span className="text-base font-bold text-slate-600 tabular-nums">
                        {parseResult.stats.ignoredEmptyValueRows}
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                      <span className="text-slate-500 block text-[11px]">
                        Linhas Ignoradas (totais/título)
                      </span>
                      <span className="text-base font-bold text-slate-600 tabular-nums">
                        {parseResult.stats.ignoredSummaryRows +
                          parseResult.stats.ignoredHeaderOrPreRows}
                      </span>
                    </div>
                  </div>

                  {parseResult.stats.ignoredEmptyValueRows > 0 && (
                    <p className="text-[11px] text-slate-500 bg-amber-50/60 border border-amber-100 p-2 rounded text-amber-900">
                      ℹ️ {parseResult.stats.ignoredEmptyValueRows} clientes com células vazias ou
                      traço ("—") na coluna de faturamento foram desconsiderados conforme regra de
                      apuração. Clientes com faturamento zero (R$ 0,00) serão devidamente
                      importados.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pré-visualização completa com scroll vertical e header sticky */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Pré-visualização dos Clientes ({parsedRows.length} linhas reconhecidas)
                  </span>
                  <Badge
                    variant="outline"
                    className="text-emerald-700 border-emerald-300 bg-emerald-50"
                  >
                    Mapeado e pronto para envio
                  </Badge>
                </div>
                <div className="relative rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                  <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 shadow-xs">
                        <tr>
                          <th className="py-2.5 px-3">Código do Cliente</th>
                          <th className="py-2.5 px-3">Razão Social / Nome</th>
                          <th className="py-2.5 px-3 text-right">Valor Faturado (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-3 font-semibold text-slate-800">{row.code}</td>
                            <td className="py-2 px-3 text-slate-600">{row.name}</td>
                            <td className="py-2 px-3 text-right font-medium text-slate-800 tabular-nums">
                              {new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(row.grossAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
                  <span>Exibindo todos os {parsedRows.length} registros com rolagem vertical.</span>
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end p-4 border-t border-slate-100 bg-slate-50/50">
            <Button
              type="submit"
              disabled={submitting || !!existingRunError || parsedRows.length === 0}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold flex items-center gap-2 h-11 px-6 shadow-md shadow-teal-900/10"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Importando e auditando...</span>
                </>
              ) : (
                <>
                  <span>Enviar e Auditar</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
