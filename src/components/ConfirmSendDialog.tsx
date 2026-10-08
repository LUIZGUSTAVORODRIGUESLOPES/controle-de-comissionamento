import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Loader2,
  Calendar,
  Users,
  Mail,
  CheckCircle2,
  FileText,
  TableProperties,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react'
import type { ReportRecipientItem } from '@/services/commissionService'

export interface ConfirmSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBackToRecipients: () => void
  onConfirmSend: () => Promise<void>
  isSending: boolean
  // Dados para o Resumo
  // 1. Usuários que constam no relatório
  commissionedUsersList: string[]
  filteredUserLabel?: string
  isSingleSeller?: boolean
  // 2. Período e configurações
  periodText: string
  viewType: 'summary' | 'detailed'
  originFilter?: 'all' | 'inbound' | 'outbound'
  // 3. Destinatários selecionados
  recipients: ReportRecipientItem[]
}

export const ConfirmSendDialog: React.FC<ConfirmSendDialogProps> = ({
  open,
  onOpenChange,
  onBackToRecipients,
  onConfirmSend,
  isSending,
  commissionedUsersList,
  filteredUserLabel,
  isSingleSeller = false,
  periodText,
  viewType,
  originFilter = 'all',
  recipients,
}) => {
  const originLabelMap: Record<string, string> = {
    all: 'Todas as Origens (Inbound e Outbound)',
    inbound: 'Apenas Inbound',
    outbound: 'Apenas Outbound',
  }

  const viewTypeLabel = viewType === 'summary' ? 'Visão Resumida' : 'Visão Detalhada'
  const recipientsCount = recipients.length

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSending) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] flex flex-col p-0 overflow-hidden sm:rounded-xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-100 text-[#0F766E] flex items-center justify-center shrink-0 shadow-2xs">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Confirmar Envio do Relatório
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Revise os parâmetros consolidados antes do disparo definitivo por e-mail.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800">
          {/* Texto de abertura exigido */}
          <div className="p-3.5 bg-teal-50/80 border border-teal-200/90 rounded-lg text-teal-950">
            <p className="text-sm font-semibold leading-relaxed">
              Você confirma o envio do relatório com as configurações abaixo?
            </p>
          </div>

          {/* 1. Usuário(s) que consta(m) no relatório */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-4 bg-white shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white shrink-0">
                  1
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Usuário(s) que consta(m) no relatório
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-600">
                {commissionedUsersList.length === 1
                  ? '1 comissionado'
                  : `${commissionedUsersList.length} comissionados`}
              </Badge>
            </div>

            <div className="pt-1">
              {filteredUserLabel && !isSingleSeller && (
                <p className="text-xs text-slate-500 mb-2">
                  Filtro aplicado: <strong className="text-slate-700">{filteredUserLabel}</strong>
                </p>
              )}

              {commissionedUsersList.length === 0 ? (
                <div className="p-3 bg-slate-50 rounded border border-dashed border-slate-200 text-xs text-slate-500 italic">
                  Nenhum colaborador comissionado encontrado para o período/filtros atuais.
                </div>
              ) : commissionedUsersList.length === 1 ? (
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                  <Users className="h-4 w-4 text-[#0F766E] shrink-0" />
                  <span className="text-sm font-semibold text-slate-900">
                    {commissionedUsersList[0]}
                  </span>
                </div>
              ) : (
                <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-md border border-slate-100 divide-y divide-slate-100 space-y-1">
                  {commissionedUsersList.map((name, idx) => (
                    <div
                      key={`${name}-${idx}`}
                      className="flex items-center gap-2 py-1 px-1 text-xs text-slate-800"
                    >
                      <Users className="h-3 w-3 text-[#0F766E] shrink-0" />
                      <span className="font-medium truncate">{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. Período do relatório */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-4 bg-white shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white shrink-0">
                2
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Período do relatório
              </span>
            </div>

            <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-md border border-slate-100 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#0F766E] shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Competência / Período
                  </span>
                  <span className="text-xs font-bold text-slate-900 truncate block">
                    {periodText}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-md border border-slate-100 flex items-center gap-2">
                {viewType === 'summary' ? (
                  <TableProperties className="h-4 w-4 text-[#0F766E] shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-[#0F766E] shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Tipo de Visão
                  </span>
                  <span className="text-xs font-bold text-slate-900 truncate block">
                    {viewTypeLabel}
                  </span>
                </div>
              </div>

              {originFilter && originFilter !== 'all' && (
                <div className="p-2.5 bg-slate-50 rounded-md border border-slate-100 flex items-center gap-2 sm:col-span-2">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Filtro de Origem
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {originLabelMap[originFilter] || originFilter}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Destinatário(s) */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-4 bg-white shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white shrink-0">
                  3
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Destinatário(s)
                </span>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  recipientsCount === 0
                    ? 'border-rose-300 text-rose-700 bg-rose-50'
                    : 'border-teal-200 text-[#0F766E] bg-teal-50'
                }`}
              >
                {recipientsCount === 1 ? '1 destinatário' : `${recipientsCount} destinatários`}
              </Badge>
            </div>

            <div className="pt-1">
              {recipientsCount === 0 ? (
                <div className="p-3 bg-rose-50 rounded border border-rose-200 text-xs text-rose-700 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Nenhum destinatário selecionado no passo anterior.</span>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-md border border-slate-100 divide-y divide-slate-100 space-y-1">
                  {recipients.map((rec, idx) => (
                    <div
                      key={`${rec.email}-${idx}`}
                      className="flex items-center justify-between gap-2 py-1.5 px-1 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate">{rec.name}</span>
                        <span className="text-slate-400 truncate text-[11px]">
                          &lt;{rec.email}&gt;
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 shrink-0 border-slate-200 text-slate-600 bg-white"
                      >
                        {rec.kind === 'admin_copy'
                          ? 'Admin'
                          : rec.kind === 'cc_hr'
                            ? 'RH'
                            : rec.kind === 'cc_finance'
                              ? 'Financeiro'
                              : rec.kind === 'custom'
                                ? 'Avulso'
                                : 'Colaborador'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer com Ações: Cancelar (Voltar) e Enviar */}
        <DialogFooter className="p-4 px-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onBackToRecipients}
            disabled={isSending}
            className="text-xs h-9 gap-1.5 order-2 sm:order-1 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Cancelar</span>
          </Button>

          <Button
            type="button"
            onClick={onConfirmSend}
            disabled={recipientsCount === 0 || isSending}
            className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-xs h-9 px-5 gap-2 shadow-xs order-1 sm:order-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Disparando relatórios...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Enviar</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
