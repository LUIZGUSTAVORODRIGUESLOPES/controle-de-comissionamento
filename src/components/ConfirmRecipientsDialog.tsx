import React, { useState, useMemo, useEffect } from 'react'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Mail,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  Shield,
  Briefcase,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react'
import type { AppUser, SystemSettings } from '@/types/database'
import type { ReportRecipientItem } from '@/services/commissionService'

const emailSchema = z
  .string()
  .trim()
  .email('E-mail inválido. Digite um formato válido (ex: nome@empresa.com.br)')

export interface ConfirmRecipientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  competenceMonthText: string
  allUsers: AppUser[]
  systemSettings: SystemSettings | null
  currentUserId?: string
  isSending: boolean
  commissionedUserIds?: string[] | Set<string>
  onConfirmSend: (recipients: ReportRecipientItem[]) => Promise<void>
}

interface DialogRecipientRow {
  id: string // internal unique key
  userId?: string
  name: string
  email: string
  role?: string
  kind: 'self' | 'cc_hr' | 'cc_finance' | 'admin_copy' | 'custom'
  selected: boolean
  isDefault: boolean
  tag: string
  description?: string
  isCustom?: boolean
  hasCommissionInPeriod?: boolean
}

export const ConfirmRecipientsDialog: React.FC<ConfirmRecipientsDialogProps> = ({
  open,
  onOpenChange,
  competenceMonthText,
  allUsers,
  systemSettings,
  currentUserId,
  isSending,
  commissionedUserIds,
  onConfirmSend,
}) => {
  const [rows, setRows] = useState<DialogRecipientRow[]>([])
  const [customEmailInput, setCustomEmailInput] = useState('')
  const [customNameInput, setCustomNameInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  // Set com os IDs de usuários que possuem comissão no período selecionado
  const commUserSet = useMemo(() => {
    if (!commissionedUserIds) return null
    if (commissionedUserIds instanceof Set) return commissionedUserIds
    return new Set(commissionedUserIds)
  }, [commissionedUserIds])

  // Inicializar destinatários quando o diálogo abre ou quando a lista de usuários mudar
  useEffect(() => {
    if (!open) return

    const initialRows: DialogRecipientRow[] = []

    // 1. Destinatários Colaboradores e Admins de `allUsers`
    // Ordenar: sales/manager primeiro, depois admins
    const sortedUsers = [...allUsers].sort((a, b) => {
      const orderRole = (r: string) => (r === 'sales' ? 1 : r === 'manager' ? 2 : 3)
      if (orderRole(a.role) !== orderRole(b.role)) {
        return orderRole(a.role) - orderRole(b.role)
      }
      return a.name.localeCompare(b.name)
    })

    for (const u of sortedUsers) {
      const isCurrentUser = currentUserId && u.id === currentUserId
      const isAdmin = u.role === 'admin'
      const isSalesOrManager = u.role === 'sales' || u.role === 'manager'

      // Regra a: Colaborador sales/manager deve ter auto_send_report_to_self = true
      // E TAMBÉM possuir comissão calculada no período selecionado para ser pré-marcado!
      const autoSendPref = u.auto_send_report_to_self !== false
      const hasCommission = commUserSet !== null ? commUserSet.has(u.id) : true

      let isSelectedByDefault = false
      let tagLabel = 'Colaborador'
      let kind: DialogRecipientRow['kind'] = 'self'
      let description = 'Extrato individual de comissão'

      if (isSalesOrManager) {
        // Pré-seleção inteligente: só marca quem TEM comissão no período
        isSelectedByDefault = autoSendPref && hasCommission
        tagLabel = u.role === 'sales' ? 'Vendedor' : 'Gerente'
        kind = 'self'

        if (!hasCommission) {
          description = autoSendPref
            ? 'Sem comissão no período (desmarcado por padrão)'
            : 'Preferência inativa e sem comissão no período'
        } else {
          description = autoSendPref
            ? 'Comissão calculada no período &bull; Envio automático ativo'
            : 'Comissão calculada no período &bull; Preferência inativa'
        }
      } else if (isAdmin) {
        kind = 'admin_copy'
        tagLabel = isCurrentUser ? 'Admin (Você - Gestão)' : 'Admin (Gestão)'
        // Admins recebem o resumo consolidado de gestão independentemente de comissão
        isSelectedByDefault = autoSendPref
        description = 'Cópia de Gestão: resumo executivo consolidado com totais da competência'
      }

      initialRows.push({
        id: `user-${u.id}`,
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        kind,
        selected: isSelectedByDefault,
        isDefault: isSelectedByDefault,
        tag: tagLabel,
        description,
        isCustom: false,
        hasCommissionInPeriod: isSalesOrManager ? hasCommission : undefined,
      })
    }

    // 2. Regra b: Cópia para RH e Cópia para Financeiro (system_settings)
    // Checar se há colaboradores que têm cc_hr ou cc_finance ativos
    const hasAnyCcHr = allUsers.some((u) => u.cc_hr)
    const hasAnyCcFin = allUsers.some((u) => u.cc_finance)

    const hrEmail = systemSettings?.hr_email?.trim()
    const financeEmail = systemSettings?.finance_email?.trim()

    if (hrEmail) {
      initialRows.push({
        id: `sys-cc-hr`,
        name: 'Recursos Humanos',
        email: hrEmail,
        kind: 'cc_hr',
        selected: hasAnyCcHr,
        isDefault: hasAnyCcHr,
        tag: 'Cópia RH',
        description: hasAnyCcHr
          ? 'Configurado em Configurações do Sistema (ativado por colaboradores com Cópia RH)'
          : 'E-mail do RH configurado no sistema',
        isCustom: false,
      })
    }

    if (financeEmail) {
      // Evitar duplicar se o financeEmail já for o e-mail de um admin cadastrado
      const alreadyHasEmail = initialRows.some(
        (r) => r.email.toLowerCase() === financeEmail.toLowerCase(),
      )
      if (!alreadyHasEmail) {
        initialRows.push({
          id: `sys-cc-fin`,
          name: 'Departamento Financeiro',
          email: financeEmail,
          kind: 'cc_finance',
          selected: hasAnyCcFin,
          isDefault: hasAnyCcFin,
          tag: 'Cópia Financeiro',
          description: hasAnyCcFin
            ? 'Configurado em Configurações do Sistema (ativado por colaboradores com Cópia Financeiro)'
            : 'E-mail do Financeiro configurado no sistema',
          isCustom: false,
        })
      }
    }

    setRows(initialRows)
    setCustomEmailInput('')
    setCustomNameInput('')
    setInputError(null)
  }, [open, allUsers, systemSettings, currentUserId, commUserSet])

  // Toggle seleção de uma linha
  const handleToggleSelect = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)))
  }

  // Marcar todos ou desmarcar todos
  const handleSelectAll = (select: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: select })))
  }

  // Adicionar destinatário avulso
  const handleAddCustomRecipient = () => {
    setInputError(null)
    const emailToValidate = customEmailInput.trim()

    if (!emailToValidate) {
      setInputError('Digite um e-mail válido para adicionar.')
      return
    }

    const validation = emailSchema.safeParse(emailToValidate)
    if (!validation.success) {
      setInputError(validation.error.issues?.[0]?.message || 'E-mail em formato inválido.')
      return
    }

    const validEmail = validation.data.toLowerCase()

    // Checar se já existe na lista
    if (rows.some((r) => r.email.toLowerCase() === validEmail)) {
      setInputError('Este e-mail já está presente na lista de destinatários.')
      return
    }

    const newRow: DialogRecipientRow = {
      id: `custom-${Date.now()}`,
      name: customNameInput.trim() || validEmail.split('@')[0],
      email: validEmail,
      kind: 'custom',
      selected: true,
      isDefault: false,
      tag: 'Avulso',
      description: 'Destinatário extra adicionado manualmente para este envio',
      isCustom: true,
    }

    setRows((prev) => [...prev, newRow])
    setCustomEmailInput('')
    setCustomNameInput('')
  }

  // Remover destinatário avulso
  const handleRemoveCustom = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  // Destinatários selecionados
  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows])
  const selectedCount = selectedRows.length

  const handleConfirm = () => {
    if (selectedCount === 0 || isSending) return

    const payloadRecipients: ReportRecipientItem[] = selectedRows.map((r) => ({
      user_id: r.userId,
      email: r.email,
      name: r.name,
      kind: r.kind,
    }))

    void onConfirmSend(payloadRecipients)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden sm:rounded-xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-teal-100 text-[#0F766E] flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Confirmar Destinatários do Envio
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Competência: <strong className="text-slate-800">{competenceMonthText}</strong>{' '}
                &bull; Selecione quem receberá o demonstrativo ou adicione destinatários adicionais.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Caixa explicativa sobre Admin / Cópia de Gestão */}
          <div className="flex items-start gap-3 p-3.5 bg-teal-50/70 border border-teal-200/80 rounded-lg text-xs text-teal-950">
            <Info className="h-4 w-4 text-[#0F766E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-teal-900">
                Transparência nos envios e cópia para a gestão:
              </p>
              <p className="text-teal-800/90 leading-relaxed">
                Administradores não possuem vínculos ou comissões próprias, portanto recebem um
                <strong> resumo consolidado de gestão</strong> com os totais de faturamento e
                comissões da empresa. Colaboradores de vendas e gerência recebem seus extratos
                individuais.
              </p>
            </div>
          </div>

          {/* Quick Actions (Marcar todos / Desmarcar todos) */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Destinatários Disponíveis ({rows.length})
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectAll(true)}
                className="text-[#0F766E] hover:underline font-medium"
              >
                Marcar todos
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => handleSelectAll(false)}
                className="text-slate-500 hover:underline font-medium"
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          {/* Lista de Destinatários */}
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto bg-white shadow-2xs">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum destinatário disponível no sistema.
              </div>
            ) : (
              rows.map((row) => (
                <label
                  key={row.id}
                  htmlFor={`cb-${row.id}`}
                  className={`flex items-center justify-between p-3.5 transition-colors cursor-pointer hover:bg-slate-50/80 ${
                    row.selected ? 'bg-teal-50/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Checkbox
                      id={`cb-${row.id}`}
                      checked={row.selected}
                      onCheckedChange={() => handleToggleSelect(row.id)}
                      className="data-[state=checked]:bg-[#0F766E] data-[state=checked]:border-[#0F766E]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {row.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 font-medium ${
                            row.kind === 'admin_copy'
                              ? 'border-indigo-200 text-indigo-700 bg-indigo-50'
                              : row.kind === 'cc_hr' || row.kind === 'cc_finance'
                                ? 'border-amber-200 text-amber-700 bg-amber-50'
                                : row.kind === 'custom'
                                  ? 'border-slate-300 text-slate-700 bg-slate-50'
                                  : 'border-teal-200 text-[#0F766E] bg-teal-50'
                          }`}
                        >
                          {row.tag}
                        </Badge>
                        {row.isDefault && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                            Pré-selecionado
                          </span>
                        )}
                        {row.hasCommissionInPeriod === false && (
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                            Sem comissão no período
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="truncate">{row.email}</span>
                        {row.description && (
                          <>
                            <span className="text-slate-300">&bull;</span>
                            <span
                              className="text-[11px] text-slate-400 truncate"
                              dangerouslySetInnerHTML={{ __html: row.description }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Botão de remoção para e-mails avulsos */}
                  {row.isCustom && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveCustom(row.id)
                      }}
                      className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 h-8 w-8 p-0 shrink-0 ml-2"
                      title="Remover destinatário avulso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </label>
              ))
            )}
          </div>

          {/* Seção Adicionar Destinatário Avulso */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Plus className="h-3.5 w-3.5 text-[#0F766E]" />
              <span>Adicionar Destinatário Avulso</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="sm:col-span-2">
                <Label htmlFor="custom-name" className="text-[11px] text-slate-600 mb-1 block">
                  Nome (opcional)
                </Label>
                <Input
                  id="custom-name"
                  placeholder="Ex: Auditoria Externa"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  className="h-9 text-xs bg-white"
                  disabled={isSending}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="custom-email" className="text-[11px] text-slate-600 mb-1 block">
                  E-mail *
                </Label>
                <Input
                  id="custom-email"
                  type="email"
                  placeholder="auditoria@exemplo.com.br"
                  value={customEmailInput}
                  onChange={(e) => {
                    setCustomEmailInput(e.target.value)
                    if (inputError) setInputError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustomRecipient()
                    }
                  }}
                  className={`h-9 text-xs bg-white ${
                    inputError ? 'border-rose-400 focus-visible:ring-rose-400' : ''
                  }`}
                  disabled={isSending}
                />
              </div>
              <div className="sm:col-span-1 flex items-end">
                <Button
                  type="button"
                  onClick={handleAddCustomRecipient}
                  disabled={isSending || !customEmailInput.trim()}
                  variant="outline"
                  className="w-full h-9 text-xs border-teal-600 text-[#0F766E] hover:bg-teal-50 font-medium"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>

            {inputError && (
              <p className="text-xs text-rose-600 flex items-center gap-1 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{inputError}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer com Resumo e Ação */}
        <DialogFooter className="p-4 px-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-600">
            {selectedCount === 0 ? (
              <span className="text-rose-600 font-semibold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Nenhum destinatário selecionado
              </span>
            ) : (
              <span>
                <strong className="text-slate-900 font-bold">{selectedCount}</strong>{' '}
                {selectedCount === 1 ? 'destinatário selecionado' : 'destinatários selecionados'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
              className="text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0 || isSending}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-xs h-9 px-4 gap-2 shadow-xs"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Disparando e-mails...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>
                    Enviar para {selectedCount} destinatário{selectedCount === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
