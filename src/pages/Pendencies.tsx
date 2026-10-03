import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMonthlyRuns,
  getBillingsForRun,
  updateCustomerDetails,
  setCustomerNoCommission,
  processMonthlyRun,
  getAllUsers,
} from '@/services/commissionService'
import type { MonthlyRun, Billing, AppUser, CustomerOrigin } from '@/types/database'
import { useToast } from '@/hooks/use-toast'
import {
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Ban,
  Play,
  Calendar,
  Lock,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

export default function Pendencies() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<MonthlyRun[]>([])
  const [selectedRun, setSelectedRun] = useState<MonthlyRun | null>(null)
  const [allBillings, setAllBillings] = useState<Billing[]>([])
  const [salesAndManagers, setSalesAndManagers] = useState<AppUser[]>([])

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)

  // Modal: Vincular Vendedor
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [targetBilling, setTargetBilling] = useState<Billing | null>(null)
  const [selectedOrigin, setSelectedOrigin] = useState<CustomerOrigin>('inbound')
  const [selectedStartDate, setSelectedStartDate] = useState<string>('2026-01-01')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [savingLink, setSavingLink] = useState(false)

  // Confirm: Marcar Sem Comissão
  const [noCommConfirmOpen, setNoCommConfirmOpen] = useState(false)
  const [noCommTargetBilling, setNoCommTargetBilling] = useState<Billing | null>(null)

  const fetchRunsAndData = async () => {
    setLoading(true)
    try {
      const [runsData, usersData] = await Promise.all([getMonthlyRuns(), getAllUsers()])

      setRuns(runsData)
      // Filter sales and manager users for assignment
      const allowedUsers = usersData.filter((u) => u.role === 'sales' || u.role === 'manager')
      setSalesAndManagers(allowedUsers)

      // Default to the first pending run or the most recent run
      const pending = runsData.find((r) => r.status === 'pending')
      const target = pending || runsData[0] || null
      setSelectedRun(target)

      if (target) {
        const bills = await getBillingsForRun(target.id)
        setAllBillings(bills)
      } else {
        setAllBillings([])
      }
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar as pendências.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRunsAndData()
  }, [])

  const handleSelectRun = async (runId: string) => {
    const run = runs.find((r) => r.id === runId)
    if (!run) return
    setSelectedRun(run)
    try {
      const bills = await getBillingsForRun(run.id)
      setAllBillings(bills)
    } catch (err) {
      console.error(err)
    }
  }

  // Derive pending billings: customers without linked users AND no_commission_flag = false
  const pendingBillings = allBillings.filter((b) => {
    const cust = b.customer
    if (!cust) return true
    if (cust.no_commission_flag) return false
    const links = cust.customer_users || []
    return links.length === 0
  })

  const isPaid = selectedRun?.status === 'paid'
  const isProcessed = selectedRun?.status === 'processed'
  const isLocked = isProcessed || isPaid
  const pendingCount = isLocked ? 0 : pendingBillings.length

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  const formatMonth = (dateStr?: string) => {
    if (!dateStr) return ''
    const [year, month] = dateStr.split('-')
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ]
    const idx = parseInt(month, 10) - 1
    return `${months[idx] || month}/${year}`
  }

  // Open Vincular Vendedor modal
  const handleOpenLinkModal = (billing: Billing) => {
    setTargetBilling(billing)
    const cust = billing.customer
    setSelectedOrigin(cust?.origin || 'inbound')
    setSelectedStartDate(cust?.start_date || new Date().toISOString().split('T')[0])
    // Pre-populate already linked users if any
    const existingIds = (cust?.customer_users || []).map((cu) => cu.user_id)
    setSelectedUserIds(existingIds)
    setLinkModalOpen(true)
  }

  const handleSaveLink = async () => {
    if (!targetBilling?.customer_id) return
    if (selectedUserIds.length === 0) {
      toast({
        title: 'Selecione ao menos um responsável',
        description: 'Vincule ao menos um vendedor ou gerente comercial ao cliente.',
        variant: 'destructive',
      })
      return
    }

    setSavingLink(true)
    try {
      await updateCustomerDetails(
        targetBilling.customer_id,
        selectedOrigin,
        selectedStartDate,
        selectedUserIds,
      )

      toast({
        title: 'Vendedor Vinculado!',
        description: `Cliente "${targetBilling.customer?.name}" atualizado com sucesso.`,
      })

      setLinkModalOpen(false)
      // Refresh billings
      if (selectedRun) {
        const bills = await getBillingsForRun(selectedRun.id)
        setAllBillings(bills)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar vínculo',
        description: err.message || 'Falha ao vincular vendedor.',
        variant: 'destructive',
      })
    } finally {
      setSavingLink(false)
    }
  }

  // Handle Marcar Sem Comissão
  const handleConfirmNoCommission = async () => {
    if (!noCommTargetBilling?.customer_id) return
    try {
      await setCustomerNoCommission(noCommTargetBilling.customer_id, true)
      toast({
        title: 'Marcado Sem Comissão',
        description: `O cliente "${noCommTargetBilling.customer?.name}" foi configurado sem comissão.`,
      })
      setNoCommConfirmOpen(false)
      if (selectedRun) {
        const bills = await getBillingsForRun(selectedRun.id)
        setAllBillings(bills)
      }
    } catch (err: any) {
      toast({
        title: 'Erro na atualização',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Process Month trigger
  const handleProcessMonth = async () => {
    if (!selectedRun) return
    if (pendingCount > 0) {
      toast({
        title: 'Gatekeeper Ativo',
        description: 'Você precisa resolver todas as pendências antes de processar o mês!',
        variant: 'destructive',
      })
      return
    }

    setIsProcessing(true)
    try {
      const res = await processMonthlyRun(selectedRun.id)
      toast({
        title: 'Mês Processado com Sucesso!',
        description: `${res.billingsProcessed || allBillings.length} faturamentos e ${res.commissionsGenerated || 0} comissões geradas.`,
      })

      // Navigate to reports
      navigate('/reports')
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro no cálculo do mês',
        description: err.message || 'Falha ao processar comissões.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header with Run Selector and Process Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pendências do Mês {selectedRun ? formatMonth(selectedRun.month_year) : ''}
            </h2>
            {isPaid ? (
              <Badge className="bg-slate-900 text-white border-slate-700 font-semibold gap-1">
                <Lock className="h-3 w-3 text-amber-400" />
                Mês Fechado / Pago
              </Badge>
            ) : isProcessed ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold">
                Processado
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold">
                {pendingCount} {pendingCount === 1 ? 'pendência' : 'pendências'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gatekeeper de Apuração: O sistema bloqueia o fechamento até que todos os clientes
            faturados tenham regras de comissão definidas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {runs.length > 1 && (
            <Select value={selectedRun?.id || ''} onValueChange={handleSelectRun}>
              <SelectTrigger className="w-56 h-10 border-slate-300">
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {formatMonth(r.month_year)}{' '}
                    {r.status === 'paid'
                      ? '🔒 (Pago)'
                      : r.status === 'processed'
                        ? '✓ (Processado)'
                        : '⏳ (Pendente)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Process Button with Gatekeeper validation */}
          <Button
            onClick={handleProcessMonth}
            disabled={pendingCount > 0 || isLocked || isProcessing}
            className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold h-11 px-6 shadow-md shadow-teal-900/10 gap-2 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>Processando Mês...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Processar Mês</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Gatekeeper Banners */}
      {isPaid ? (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-white flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-white">Mês Fechado e Pago.</span> Este período
              está completamente travado por regras de compliance. Alterações de clientes,
              faturamentos e impostos estão desabilitadas.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/reports')}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0"
          >
            Ver Relatório Travado
          </Button>
        </div>
      ) : isProcessed ? (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Este mês já foi processado e auditado.</span> As
            comissões foram calculadas e estão disponíveis na aba de relatórios.
          </div>
        </div>
      ) : pendingCount > 0 ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-bold">Regras do Gatekeeper:</p>
            <p className="text-slate-700">
              Revise os clientes abaixo. Clientes sem vendedor vinculado e sem a flag "Sem Comissão"
              precisam ser resolvidos antes de liberar o cálculo final.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold">
              Todas as pendências foram resolvidas. Você já pode processar o mês!
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleProcessMonth}
            disabled={isProcessing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
          >
            Processar Agora
          </Button>
        </div>
      )}

      {/* Pendencies Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Clientes que Requerem Auditoria ({pendingCount})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Associe executivos comerciais ou declare explicitamente se o cliente não gera comissão
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">ID do Cliente</th>
                  <th className="py-3 px-4">Nome do Cliente</th>
                  <th className="py-3 px-4 text-right">Valor Faturado</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingBillings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <span className="font-semibold text-slate-700">
                          Nenhuma pendência para este mês!
                        </span>
                        <span className="text-xs text-slate-400">
                          Todos os clientes faturados estão devidamente atribuídos ou dispensados.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingBillings.map((b) => {
                    const cust = b.customer
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {cust?.customer_code}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">{cust?.name}</td>
                        <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-900">
                          {formatBRL(Number(b.gross_amount))}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            Sem vendedor
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <Button
                            size="sm"
                            disabled={isLocked}
                            onClick={() => handleOpenLinkModal(b)}
                            className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs gap-1.5 h-8 font-semibold shadow-sm disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Vincular Vendedor</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLocked}
                            onClick={() => {
                              setNoCommTargetBilling(b)
                              setNoCommConfirmOpen(true)
                            }}
                            className="text-xs border-slate-300 text-slate-700 hover:bg-slate-100 h-8 gap-1.5 disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5 text-slate-500" />
                            <span>Marcar Sem Comissão</span>
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Full Month Client List (Audit View) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            Todos os Clientes Faturados no Mês ({allBillings.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Visão consolidada com responsáveis atribuídos e status de comissionamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-2.5 px-4">ID</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Origem</th>
                  <th className="py-2.5 px-4">Início Contrato</th>
                  <th className="py-2.5 px-4">Responsáveis Vinculados</th>
                  <th className="py-2.5 px-4 text-right">Faturamento Bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allBillings.map((b) => {
                  const cust = b.customer
                  const usersLinked = cust?.customer_users || []
                  const noComm = cust?.no_commission_flag

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-semibold text-slate-700">
                        {cust?.customer_code}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{cust?.name}</td>
                      <td className="py-2.5 px-4 capitalize">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {cust?.origin || 'outbound'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {cust?.start_date || '-'}
                      </td>
                      <td className="py-2.5 px-4">
                        {noComm ? (
                          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            Dispensado de Comissão
                          </span>
                        ) : usersLinked.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {usersLinked.map((u) => (
                              <Badge
                                key={u.id}
                                variant="outline"
                                className="text-[11px] bg-teal-50 border-teal-200 text-teal-800 font-medium"
                              >
                                {u.user?.name || 'Vendedor'}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-bold">Nenhum</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-slate-800">
                        {formatBRL(Number(b.gross_amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: Vincular Vendedor */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Vincular Vendedor ao Cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure a origem do cliente, a data de início do contrato e associe os executivos
              comerciais e gerentes responsáveis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500">Cliente Selecionado:</span>
              <p className="font-bold text-slate-800 text-sm">{targetBilling?.customer?.name}</p>
              <p className="text-slate-500 font-mono mt-0.5">
                {targetBilling?.customer?.customer_code}
              </p>
            </div>

            {/* Select Origin */}
            <div className="space-y-1.5">
              <Label
                htmlFor="origin"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Origem do Cliente
              </Label>
              <Select
                value={selectedOrigin}
                onValueChange={(val: CustomerOrigin) => setSelectedOrigin(val)}
              >
                <SelectTrigger id="origin" className="h-10">
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound (Lead receptivo / Vitalício)</SelectItem>
                  <SelectItem value="outbound">
                    Outbound (Prospecção ativa / Regra 1º vs 2º ano)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contract Start Date */}
            <div className="space-y-1.5">
              <Label
                htmlFor="start_date"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Data de Início do Contrato (Base de Cálculo de Ano)
              </Label>
              <Input
                id="start_date"
                type="date"
                required
                value={selectedStartDate}
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="h-10"
              />
              <p className="text-[11px] text-slate-500">
                Se &le; 12 meses usa a alíquota de 1º ano; acima de 12 meses usa a alíquota de 2º
                ano+.
              </p>
            </div>

            {/* Multi-select Users */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Responsáveis Vinculados (Executivos & Gerentes)
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                {salesAndManagers.map((u) => {
                  const checked = selectedUserIds.includes(u.id)
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleUserSelection(u.id)}
                      className="flex items-center justify-between p-2 rounded hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox checked={checked} />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{u.name}</p>
                          <p className="text-[11px] text-slate-500">{u.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">
                        {u.role}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveLink}
              disabled={savingLink}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold"
            >
              {savingLink ? 'Salvando...' : 'Salvar Vínculo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRM: Marcar Sem Comissão */}
      <AlertDialog open={noCommConfirmOpen} onOpenChange={setNoCommConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar Cliente Sem Comissão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está definindo que o cliente{' '}
              <strong className="text-slate-900">{noCommTargetBilling?.customer?.name}</strong> não
              gerará comissão para nenhum vendedor neste e nos próximos meses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmNoCommission}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirmar Dispensa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* FULL-SCREEN PROCESSING OVERLAY */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="w-full max-w-md space-y-4">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#0F766E] to-[#14B8A6] flex items-center justify-center animate-pulse">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-bold">Processando fechamento do mês...</h3>
            <p className="text-xs text-slate-300">
              Aplicando deduções fiscais dinâmicas, avaliando fórmulas matemáticas e gerando as
              comissões por vendedor.
            </p>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-gradient-to-r from-teal-500 via-amber-400 to-teal-500 h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
