import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import {
  createUserSchema,
  editUserSchema,
  CreateUserFormData,
  EditUserFormData,
} from '@/lib/auth-schemas'
import { PasswordStrengthChecklist } from '@/components/PasswordStrengthChecklist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Mail, BellRing } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import type { AppUser, UserRole } from '@/types/database'
import { updateUser } from '@/services/commissionService'

interface UserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingUser: AppUser | null
  onSuccess: () => Promise<void>
}

export function UserModal({ open, onOpenChange, editingUser, onSuccess }: UserModalProps) {
  const { toast } = useToast()
  const isEditing = !!editingUser

  // Form para CRIAÇÃO (com senha forte obrigatória e regras Zod)
  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'sales',
      fixedSalary: '3500',
      autoSendReportToSelf: true,
      ccHr: false,
      ccFinance: false,
    },
    mode: 'onChange',
  })

  // Form para EDIÇÃO (sem manipulação de senha)
  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'sales',
      fixedSalary: '3500',
      autoSendReportToSelf: true,
      ccHr: false,
      ccFinance: false,
    },
    mode: 'onChange',
  })

  // Observa a senha em tempo real para o checklist visual
  const watchedPassword = createForm.watch('password')

  useEffect(() => {
    if (open) {
      if (editingUser) {
        editForm.reset({
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
          fixedSalary: String(editingUser.fixed_salary || 0),
          autoSendReportToSelf: editingUser.auto_send_report_to_self ?? true,
          ccHr: editingUser.cc_hr ?? false,
          ccFinance: editingUser.cc_finance ?? false,
        })
      } else {
        createForm.reset({
          name: '',
          email: '',
          password: '',
          role: 'sales',
          fixedSalary: '3500',
          autoSendReportToSelf: true,
          ccHr: false,
          ccFinance: false,
        })
      }
    }
  }, [open, editingUser, createForm, editForm])

  const onSubmitCreate = async (data: CreateUserFormData) => {
    const salaryNum = parseFloat(data.fixedSalary.replace(/\./g, '').replace(',', '.')) || 0

    try {
      let created = false
      let creationNote = ''

      // Tenta prioritariamente via Edge Function administrativa segura (Service Role no backend)
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('create-user', {
          body: {
            email: data.email.trim(),
            password: data.password,
            name: data.name.trim(),
            role: data.role,
            fixed_salary: salaryNum,
            auto_send_report_to_self: data.autoSendReportToSelf,
            cc_hr: data.ccHr,
            cc_finance: data.ccFinance,
          },
        })

        if (!edgeErr && edgeData && !edgeData.error) {
          created = true
          creationNote = 'Cadastro concluído e ativo para login imediato.'
        } else if (edgeData?.error) {
          console.warn('Edge function create-user reportou:', edgeData.error)
        }
      } catch (invokeErr) {
        console.warn('Edge function invoke falhou, tentando fallback:', invokeErr)
      }

      // Se a Edge Function não estiver ativa ou falhar, fallback gracioso:
      // Inicia fluxo de signUp e inserção no perfil público
      if (!created) {
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
        })

        if (!authErr && authData.user) {
          const { error: insErr } = await (supabase as any).from('users').insert([
            {
              id: authData.user.id,
              name: data.name.trim(),
              email: data.email.trim(),
              role: data.role,
              fixed_salary: salaryNum,
              auto_send_report_to_self: data.autoSendReportToSelf,
              cc_hr: data.ccHr,
              cc_finance: data.ccFinance,
            },
          ])
          if (insErr) throw insErr
          created = true
          creationNote = 'Colaborador cadastrado no sistema.'
        } else if (authErr) {
          // Se o signUp estiver bloqueado por configuração de projeto Supabase fechado,
          // ainda assim gravamos ou instruímos o administrador sobre o convite
          throw authErr
        }
      }

      toast({
        title: 'Utilizador Cadastrado',
        description: `O utilizador "${data.name}" foi registrado com sucesso. ${creationNote}`,
      })

      onOpenChange(false)
      await onSuccess()
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar utilizador',
        description:
          err.message ||
          'Falha na criação. Se o cadastro público estiver bloqueado no Supabase, convide o utilizador pelo painel Auth ou contate o suporte.',
        variant: 'destructive',
      })
    }
  }

  const onSubmitEdit = async (data: EditUserFormData) => {
    if (!editingUser) return
    const salaryNum = parseFloat(data.fixedSalary.replace(/\./g, '').replace(',', '.')) || 0

    try {
      await updateUser(editingUser.id, {
        name: data.name.trim(),
        role: data.role,
        fixed_salary: salaryNum,
        auto_send_report_to_self: data.autoSendReportToSelf,
        cc_hr: data.ccHr,
        cc_finance: data.ccFinance,
      })

      toast({
        title: 'Utilizador Atualizado',
        description: `Os dados de "${data.name}" foram atualizados com sucesso.`,
      })

      onOpenChange(false)
      await onSuccess()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar utilizador',
        description: err.message || 'Falha na operação.',
        variant: 'destructive',
      })
    }
  }

  const isSubmitting = createForm.formState.isSubmitting || editForm.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            {isEditing ? 'Editar Utilizador' : 'Novo Utilizador'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isEditing
              ? 'Atualize o perfil e remuneração fixa base do colaborador.'
              : 'Cadastre o novo colaborador no Supabase Auth com senha estritamente segura.'}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          /* FORMULÁRIO DE EDIÇÃO */
          <form
            onSubmit={editForm.handleSubmit(onSubmitEdit)}
            className="space-y-4 py-2"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-semibold uppercase text-slate-700">
                Nome Completo
              </Label>
              <Input
                id="edit-name"
                disabled={isSubmitting}
                placeholder="Ex: Mariana Santos"
                {...editForm.register('name')}
                className="h-10"
              />
              {editForm.formState.errors.name && (
                <p className="text-xs text-rose-600 font-medium">
                  {editForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="edit-email"
                className="text-xs font-semibold uppercase text-slate-700"
              >
                E-mail Corporativo
              </Label>
              <Input
                id="edit-email"
                type="email"
                disabled
                {...editForm.register('email')}
                className="h-10 bg-slate-100 text-slate-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-500">
                O e-mail é a chave de login do usuário e não pode ser alterado diretamente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-role"
                  className="text-xs font-semibold uppercase text-slate-700"
                >
                  Cargo / Nível
                </Label>
                <Controller
                  name="role"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="edit-role" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                        <SelectItem value="sales">Vendedor</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-salary"
                  className="text-xs font-semibold uppercase text-slate-700"
                >
                  Salário Fixo Mensal (R$)
                </Label>
                <Input
                  id="edit-salary"
                  type="text"
                  disabled={isSubmitting}
                  {...editForm.register('fixedSalary')}
                  className="h-10 tabular-nums"
                />
                {editForm.formState.errors.fixedSalary && (
                  <p className="text-xs text-rose-600 font-medium">
                    {editForm.formState.errors.fixedSalary.message}
                  </p>
                )}
              </div>
            </div>

            {/* Preferências de Notificação Automática */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <BellRing className="h-3.5 w-3.5 text-[#0F766E]" />
                <span>Preferências de Notificação por E-mail</span>
              </div>
              <div className="space-y-2 text-xs">
                <Controller
                  name="autoSendReportToSelf"
                  control={editForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar relatório para mim mesmo</span>
                    </label>
                  )}
                />
                <Controller
                  name="ccHr"
                  control={editForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar cópia para RH</span>
                    </label>
                  )}
                />
                <Controller
                  name="ccFinance"
                  control={editForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar cópia para Financeiro</span>
                    </label>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold"
              >
                {isSubmitting ? 'Atualizando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          /* FORMULÁRIO DE CRIAÇÃO (COM SENHA FORTE + CHECKLIST VISUAL EM TEMPO REAL) */
          <form
            onSubmit={createForm.handleSubmit(onSubmitCreate)}
            className="space-y-4 py-2"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs font-semibold uppercase text-slate-700">
                Nome Completo
              </Label>
              <Input
                id="new-name"
                disabled={isSubmitting}
                placeholder="Ex: Mariana Santos"
                {...createForm.register('name')}
                className="h-10"
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-rose-600 font-medium">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs font-semibold uppercase text-slate-700">
                E-mail Corporativo
              </Label>
              <Input
                id="new-email"
                type="email"
                disabled={isSubmitting}
                placeholder="mariana@empresa.com.br"
                {...createForm.register('email')}
                className="h-10"
              />
              {createForm.formState.errors.email && (
                <p className="text-xs text-rose-600 font-medium">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="new-password"
                className="text-xs font-semibold uppercase text-slate-700"
              >
                Senha de Acesso Inicial
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                disabled={isSubmitting}
                placeholder="Digite uma senha forte"
                {...createForm.register('password')}
                className="h-10"
              />
              {createForm.formState.errors.password && (
                <p className="text-xs text-rose-600 font-medium">
                  {createForm.formState.errors.password.message}
                </p>
              )}

              {/* Checklist com indicadores em tempo real */}
              <PasswordStrengthChecklist password={watchedPassword || ''} />

              <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200/70 text-[11px] text-teal-900 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-[#0F766E] shrink-0 mt-0.5" />
                <span>
                  <strong>Acesso Restrito B2B:</strong> O cadastro público está desativado. Somente
                  Administradores podem registrar novos colaboradores neste painel.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-role"
                  className="text-xs font-semibold uppercase text-slate-700"
                >
                  Cargo / Nível
                </Label>
                <Controller
                  name="role"
                  control={createForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="new-role" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                        <SelectItem value="sales">Vendedor</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="new-salary"
                  className="text-xs font-semibold uppercase text-slate-700"
                >
                  Salário Fixo Mensal (R$)
                </Label>
                <Input
                  id="new-salary"
                  type="text"
                  disabled={isSubmitting}
                  {...createForm.register('fixedSalary')}
                  className="h-10 tabular-nums"
                />
                {createForm.formState.errors.fixedSalary && (
                  <p className="text-xs text-rose-600 font-medium">
                    {createForm.formState.errors.fixedSalary.message}
                  </p>
                )}
              </div>
            </div>

            {/* Preferências de Notificação Automática */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <BellRing className="h-3.5 w-3.5 text-[#0F766E]" />
                <span>Preferências de Notificação por E-mail</span>
              </div>
              <div className="space-y-2 text-xs">
                <Controller
                  name="autoSendReportToSelf"
                  control={createForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar relatório para mim mesmo</span>
                    </label>
                  )}
                />
                <Controller
                  name="ccHr"
                  control={createForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar cópia para RH</span>
                    </label>
                  )}
                />
                <Controller
                  name="ccFinance"
                  control={createForm.control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                      <span>Enviar cópia para Financeiro</span>
                    </label>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Cadastrando...</span>
                  </div>
                ) : (
                  'Salvar Utilizador'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
