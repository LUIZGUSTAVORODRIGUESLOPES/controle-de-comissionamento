import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import {
  createUserSchema,
  editUserSchema,
  resetPasswordSchema,
  CreateUserFormData,
  EditUserFormData,
  ResetPasswordFormData,
  generateStrongPassword,
} from '@/lib/auth-schemas'
import { PasswordStrengthChecklist } from '@/components/PasswordStrengthChecklist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck,
  BellRing,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react'
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
import type { AppUser } from '@/types/database'
import {
  updateUser,
  getCommissionProfilesByUserId,
  upsertCommissionProfile,
} from '@/services/commissionService'
import { Percent, Info } from 'lucide-react'

interface UserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingUser: AppUser | null
  onSuccess: () => Promise<void>
}

export function UserModal({ open, onOpenChange, editingUser, onSuccess }: UserModalProps) {
  const { toast } = useToast()
  const isEditing = !!editingUser

  // Estados locais para geração de senha na criação
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [showGeneratedPassword, setShowGeneratedPassword] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Estados locais para seção de redefinição de senha na edição
  const [isResetSectionOpen, setIsResetSectionOpen] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [isSubmittingReset, setIsSubmittingReset] = useState(false)

  // Form para CRIAÇÃO
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

  // Form para EDIÇÃO DE PERFIL
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

  // Form para REDEFINIÇÃO DE SENHA NA EDIÇÃO
  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onChange',
  })

  // Observar a role em tempo real para controle dinâmico da UI
  const createRole = createForm.watch('role')
  const editRole = editForm.watch('role')

  // Estados dos Perfis de Comissão (Inbound, Outbound, Taxa de Implantação)
  // Criação:
  const [createInboundRate, setCreateInboundRate] = useState('3.0')
  const [createInboundSetup, setCreateInboundSetup] = useState('')
  const [createOutboundY1, setCreateOutboundY1] = useState('5.0')
  const [createOutboundY2, setCreateOutboundY2] = useState('2.5')
  const [createOutboundSetup, setCreateOutboundSetup] = useState('10.0')

  // Edição:
  const [editInboundId, setEditInboundId] = useState<string | null>(null)
  const [editInboundRate, setEditInboundRate] = useState('3.0')
  const [editInboundSetup, setEditInboundSetup] = useState('')
  const [editOutboundId, setEditOutboundId] = useState<string | null>(null)
  const [editOutboundY1, setEditOutboundY1] = useState('5.0')
  const [editOutboundY2, setEditOutboundY2] = useState('2.5')
  const [editOutboundSetup, setEditOutboundSetup] = useState('')
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  const watchedResetPassword = resetForm.watch('newPassword')

  // Gera uma nova senha segura para o formulário de criação
  const handleRegeneratePassword = () => {
    const newPass = generateStrongPassword(12)
    setGeneratedPassword(newPass)
    createForm.setValue('password', newPass, { shouldValidate: true })
    setCopiedPassword(false)
  }

  const handleCopyPassword = (text: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedPassword(true)
    toast({
      title: 'Senha copiada!',
      description: 'A palavra-passe temporária foi copiada para a área de transferência.',
    })
    setTimeout(() => setCopiedPassword(false), 2500)
  }

  // Preenche senha aleatória sugerida no campo de redefinição de senha
  const handleSuggestResetPassword = () => {
    const suggested = generateStrongPassword(12)
    resetForm.setValue('newPassword', suggested, { shouldValidate: true })
    resetForm.setValue('confirmPassword', suggested, { shouldValidate: true })
    setShowResetPassword(true)
  }

  useEffect(() => {
    if (open) {
      setIsResetSectionOpen(false)
      setShowResetPassword(false)
      setCopiedPassword(false)

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
        resetForm.reset({
          newPassword: '',
          confirmPassword: '',
        })

        // Carregar perfis de comissão existentes se for sales ou manager
        if (editingUser.role !== 'admin') {
          setLoadingProfiles(true)
          getCommissionProfilesByUserId(editingUser.id)
            .then((profiles) => {
              const inProf = profiles.find((p) => p.type === 'inbound')
              const outProf = profiles.find((p) => p.type === 'outbound')

              if (inProf) {
                setEditInboundId(inProf.id)
                setEditInboundRate(String(inProf.default_percentage_year_1))
                setEditInboundSetup(
                  inProf.setup_fee_percentage !== null && inProf.setup_fee_percentage !== undefined
                    ? String(inProf.setup_fee_percentage)
                    : '',
                )
              } else {
                setEditInboundId(null)
                setEditInboundRate('3.0')
                setEditInboundSetup('')
              }

              if (outProf) {
                setEditOutboundId(outProf.id)
                setEditOutboundY1(String(outProf.default_percentage_year_1))
                setEditOutboundY2(String(outProf.default_percentage_year_2_plus))
                setEditOutboundSetup(
                  outProf.setup_fee_percentage !== null &&
                    outProf.setup_fee_percentage !== undefined
                    ? String(outProf.setup_fee_percentage)
                    : '',
                )
              } else {
                setEditOutboundId(null)
                setEditOutboundY1('5.0')
                setEditOutboundY2('2.5')
                setEditOutboundSetup('')
              }
            })
            .catch((err) => console.warn('Erro ao carregar perfis do usuário:', err))
            .finally(() => setLoadingProfiles(false))
        } else {
          setEditInboundId(null)
          setEditOutboundId(null)
        }
      } else {
        const initialPass = generateStrongPassword(12)
        setGeneratedPassword(initialPass)
        setShowGeneratedPassword(false)
        createForm.reset({
          name: '',
          email: '',
          password: initialPass,
          role: 'sales',
          fixedSalary: '3500',
          autoSendReportToSelf: true,
          ccHr: false,
          ccFinance: false,
        })
        // Reset commission profile inputs for creation
        setCreateInboundRate('3.0')
        setCreateInboundSetup('')
        setCreateOutboundY1('5.0')
        setCreateOutboundY2('2.5')
        setCreateOutboundSetup('10.0')
      }
    }
  }, [open, editingUser, createForm, editForm, resetForm])

  // Submissão da criação de usuário
  const onSubmitCreate = async (data: CreateUserFormData) => {
    const salaryNum = parseFloat(data.fixedSalary.replace(/\./g, '').replace(',', '.')) || 0

    try {
      let created = false
      let creationNote = ''

      // Tenta prioritariamente via Edge Function administrativa segura (Service Role no backend)
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('create-user', {
          body: {
            action: 'create',
            email: data.email.trim(),
            password: data.password,
            name: data.name.trim(),
            role: data.role,
            fixed_salary: salaryNum,
            auto_send_report_to_self: data.autoSendReportToSelf,
            cc_hr: data.ccHr,
            cc_finance: data.ccFinance,
            must_change_password: true, // Força a troca no primeiro acesso
          },
        })

        if (!edgeErr && edgeData && !edgeData.error) {
          created = true
          creationNote =
            'Senha inicial gerada com sucesso. O utilizador será obrigado a alterá-la no primeiro acesso.'
          // Se o usuário criado for não-admin, atualizar os perfis de comissão se fornecidos
          if (data.role !== 'admin' && edgeData.user?.id) {
            const newUserId = edgeData.user.id
            try {
              const inRate = parseFloat(createInboundRate.replace(',', '.')) || 3.0
              const inSetup = createInboundSetup.trim()
                ? parseFloat(createInboundSetup.replace(',', '.'))
                : null
              const outY1 = parseFloat(createOutboundY1.replace(',', '.')) || 5.0
              const outY2 = parseFloat(createOutboundY2.replace(',', '.')) || 2.5
              const outSetup = createOutboundSetup.trim()
                ? parseFloat(createOutboundSetup.replace(',', '.'))
                : null

              await upsertCommissionProfile({
                user_id: newUserId,
                type: 'inbound',
                default_percentage_year_1: inRate,
                default_percentage_year_2_plus: inRate,
                setup_fee_percentage: inSetup,
              })
              await upsertCommissionProfile({
                user_id: newUserId,
                type: 'outbound',
                default_percentage_year_1: outY1,
                default_percentage_year_2_plus: outY2,
                setup_fee_percentage: outSetup,
              })
            } catch (profErr) {
              console.warn('Erro ao salvar perfis customizados na criação:', profErr)
            }
          }
        } else if (edgeData?.error) {
          console.warn('Edge function create-user reportou:', edgeData.error)
        }
      } catch (invokeErr) {
        console.warn('Edge function invoke falhou, tentando fallback:', invokeErr)
      }

      // Se a Edge Function não estiver ativa ou falhar, fallback de desenvolvimento:
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
              must_change_password: true,
            },
          ])
          if (insErr) throw insErr
          created = true
          creationNote =
            'Colaborador cadastrado no sistema. Troca de senha obrigatória no primeiro acesso.'

          // Criação dos perfis de comissão no fallback
          if (data.role !== 'admin') {
            try {
              const inRate = parseFloat(createInboundRate.replace(',', '.')) || 3.0
              const inSetup = createInboundSetup.trim()
                ? parseFloat(createInboundSetup.replace(',', '.'))
                : null
              const outY1 = parseFloat(createOutboundY1.replace(',', '.')) || 5.0
              const outY2 = parseFloat(createOutboundY2.replace(',', '.')) || 2.5
              const outSetup = createOutboundSetup.trim()
                ? parseFloat(createOutboundSetup.replace(',', '.'))
                : null

              await upsertCommissionProfile({
                user_id: authData.user.id,
                type: 'inbound',
                default_percentage_year_1: inRate,
                default_percentage_year_2_plus: inRate,
                setup_fee_percentage: inSetup,
              })
              await upsertCommissionProfile({
                user_id: authData.user.id,
                type: 'outbound',
                default_percentage_year_1: outY1,
                default_percentage_year_2_plus: outY2,
                setup_fee_percentage: outSetup,
              })
            } catch (profErr) {
              console.warn('Erro ao salvar perfis customizados no fallback de criação:', profErr)
            }
          }
        } else if (authErr) {
          throw authErr
        }
      }

      toast({
        title: 'Utilizador Cadastrado',
        description: `O colaborador "${data.name}" foi registrado. ${creationNote}`,
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

  // Submissão da edição de dados cadastrais
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

      // Se a nova role for admin, os perfis já foram limpos pelo updateUser.
      // Se não for admin, salvar ou atualizar os perfis de comissão:
      if (data.role !== 'admin') {
        const inRate = parseFloat(editInboundRate.replace(',', '.')) || 3.0
        const inSetup = editInboundSetup.trim()
          ? parseFloat(editInboundSetup.replace(',', '.'))
          : null
        const outY1 = parseFloat(editOutboundY1.replace(',', '.')) || 5.0
        const outY2 = parseFloat(editOutboundY2.replace(',', '.')) || 2.5
        const outSetup = editOutboundSetup.trim()
          ? parseFloat(editOutboundSetup.replace(',', '.'))
          : null

        await upsertCommissionProfile({
          id: editInboundId || undefined,
          user_id: editingUser.id,
          type: 'inbound',
          default_percentage_year_1: inRate,
          default_percentage_year_2_plus: inRate,
          setup_fee_percentage: inSetup,
        })

        await upsertCommissionProfile({
          id: editOutboundId || undefined,
          user_id: editingUser.id,
          type: 'outbound',
          default_percentage_year_1: outY1,
          default_percentage_year_2_plus: outY2,
          setup_fee_percentage: outSetup,
        })
      }

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

  // Submissão do Reset de Senha pelo Administrador
  const onSubmitResetPassword = async (data: ResetPasswordFormData) => {
    if (!editingUser) return

    setIsSubmittingReset(true)
    try {
      let resetSuccess = false
      let msg = ''

      // Chama a Edge Function com privilégios de Admin
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('create-user', {
          body: {
            action: 'reset-password',
            user_id: editingUser.id,
            new_password: data.newPassword,
            must_change_password: true,
          },
        })

        if (!edgeErr && edgeData && !edgeData.error) {
          resetSuccess = true
          msg =
            edgeData.message ||
            'Palavra-passe redefinida. O utilizador precisará cadastrar uma nova senha no próximo acesso.'
        } else if (edgeData?.error) {
          throw new Error(edgeData.error)
        } else if (edgeErr) {
          throw edgeErr
        }
      } catch (callErr: any) {
        console.warn('Falha na invocação da Edge Function reset-password:', callErr)
        throw new Error(
          callErr.message || 'Falha ao redefinir palavra-passe pela função administrativa.',
        )
      }

      if (resetSuccess) {
        toast({
          title: 'Palavra-passe Redefinida',
          description: msg,
        })
        resetForm.reset({ newPassword: '', confirmPassword: '' })
        setIsResetSectionOpen(false)
        await onSuccess()
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao redefinir palavra-passe',
        description: err.message || 'Não foi possível redefinir a palavra-passe do utilizador.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingReset(false)
    }
  }

  const isSubmitting =
    createForm.formState.isSubmitting || editForm.formState.isSubmitting || isSubmittingReset

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            {isEditing ? 'Editar Utilizador' : 'Novo Utilizador'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isEditing
              ? 'Atualize o perfil, remuneração e gerencie a palavra-passe do colaborador.'
              : 'Cadastre o novo colaborador. Uma senha forte e segura será gerada automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          /* FORMULÁRIO DE EDIÇÃO + RESET DE SENHA */
          <div className="space-y-6 py-2">
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-name"
                  className="text-xs font-semibold uppercase text-slate-700"
                >
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

              {/* SEÇÃO: PERFIL DE COMISSÃO (Apenas visível para Vendedor / Gerente — Non-Commissionable Admin) */}
              {editRole !== 'admin' ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-900">
                      <Percent className="h-4 w-4 text-[#0F766E]" />
                      <span>Perfil de Comissão (Inbound, Outbound & Taxa de Implantação)</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-teal-800 leading-relaxed">
                    Alíquotas padrão aplicadas aos faturamentos dos clientes deste colaborador.
                  </p>

                  {loadingProfiles ? (
                    <div className="py-2 text-center text-xs text-teal-700">
                      Carregando regras...
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      {/* Inbound */}
                      <div className="p-2.5 rounded-lg bg-white border border-teal-200 space-y-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Regra Inbound (Receptivo)
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-600">
                              Alíquota Vitalícia (%)
                            </Label>
                            <Input
                              value={editInboundRate}
                              onChange={(e) => setEditInboundRate(e.target.value)}
                              disabled={isSubmitting}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-600">
                              Taxa Implantação (%)
                            </Label>
                            <Input
                              value={editInboundSetup}
                              onChange={(e) => setEditInboundSetup(e.target.value)}
                              disabled={isSubmitting}
                              placeholder="Opcional"
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Outbound */}
                      <div className="p-2.5 rounded-lg bg-white border border-teal-200 space-y-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          Regra Outbound (Ativo)
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-600">1º Ano (%)</Label>
                            <Input
                              value={editOutboundY1}
                              onChange={(e) => setEditOutboundY1(e.target.value)}
                              disabled={isSubmitting}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-600">2º Ano+ (%)</Label>
                            <Input
                              value={editOutboundY2}
                              onChange={(e) => setEditOutboundY2(e.target.value)}
                              disabled={isSubmitting}
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-600">
                              Taxa Implantação (%)
                            </Label>
                            <Input
                              value={editOutboundSetup}
                              onChange={(e) => setEditOutboundSetup(e.target.value)}
                              disabled={isSubmitting}
                              placeholder="Opcional"
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />
                  <span>
                    <strong>Perfil Não-Comissionável:</strong> Administradores possuem acesso total
                    de gestão e não participam de regras ou recebimento de comissões. Ao salvar como
                    Administrador, eventuais vínculos comerciais e perfis de comissão são
                    desativados.
                  </span>
                </div>
              )}

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

              <div className="flex justify-end gap-2 pt-2">
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
                  {editForm.formState.isSubmitting ? 'Atualizando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>

            {/* SEÇÃO ADMINISTRATIVA: REDEFINIÇÃO DE SENHA */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
                    Redefinição de Palavra-passe
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetSectionOpen(!isResetSectionOpen)}
                  disabled={isSubmitting}
                  className="h-7 text-xs bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  {isResetSectionOpen ? 'Ocultar' : 'Redefinir Senha'}
                </Button>
              </div>

              <p className="text-[11px] text-amber-800 leading-relaxed">
                Como Administrador, você pode atribuir uma nova senha para este utilizador. Ele será
                forçado a alterá-la no próximo acesso.
              </p>

              {isResetSectionOpen && (
                <form
                  onSubmit={resetForm.handleSubmit(onSubmitResetPassword)}
                  className="pt-2 border-t border-amber-200/80 space-y-3"
                  noValidate
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Definir Nova Palavra-passe
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSuggestResetPassword}
                      className="h-6 text-[11px] text-teal-700 hover:text-teal-800 p-1 gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Gerar Senha Forte</span>
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        type={showResetPassword ? 'text' : 'password'}
                        placeholder="Nova senha forte"
                        disabled={isSubmitting}
                        {...resetForm.register('newPassword')}
                        className="h-9 pr-9 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                      >
                        {showResetPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {resetForm.formState.errors.newPassword && (
                      <p className="text-xs text-rose-600 font-medium">
                        {resetForm.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Input
                      type={showResetPassword ? 'text' : 'password'}
                      placeholder="Confirmar nova senha"
                      disabled={isSubmitting}
                      {...resetForm.register('confirmPassword')}
                      className="h-9 text-xs"
                    />
                    {resetForm.formState.errors.confirmPassword && (
                      <p className="text-xs text-rose-600 font-medium">
                        {resetForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  {/* Checklist visual em tempo real para a nova senha */}
                  <PasswordStrengthChecklist password={watchedResetPassword || ''} />

                  <div className="flex items-start gap-2 p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Ação segura: O usuário será marcado com troca obrigatória no próximo login.
                    </span>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      disabled={isSubmittingReset}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-8 px-3 gap-1.5"
                    >
                      {isSubmittingReset ? (
                        <>
                          <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Atualizando...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Confirmar Redefinição</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* FORMULÁRIO DE CRIAÇÃO (COM SENHA GERADA AUTOMATICAMENTE + COPIÁVEL) */
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

            {/* SENHA GERADA AUTOMATICAMENTE (VISÍVEL E COPIÁVEL) */}
            <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-teal-900 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-teal-700" />
                  <span>Senha Inicial Gerada Automaticamente</span>
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRegeneratePassword}
                  disabled={isSubmitting}
                  className="h-6 text-[11px] text-teal-700 hover:text-teal-800 p-1 gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Gerar Outra</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showGeneratedPassword ? 'text' : 'password'}
                    readOnly
                    value={generatedPassword}
                    className="h-10 font-mono text-sm bg-white border-teal-300 text-teal-950 font-bold tracking-wider select-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeneratedPassword(!showGeneratedPassword)}
                    className="absolute right-3 top-2.5 text-teal-600 hover:text-teal-800"
                    title={showGeneratedPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showGeneratedPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopyPassword(generatedPassword)}
                  className="h-10 px-3 bg-white border-teal-300 text-teal-800 hover:bg-teal-100 gap-1.5 shrink-0"
                  title="Copiar para área de transferência"
                >
                  {copiedPassword ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span className="text-xs font-bold">Copiar</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Informação sobre troca obrigatória */}
              <div className="p-2 rounded-lg bg-white/90 border border-teal-200 text-[11px] text-teal-900 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-[#0F766E] shrink-0 mt-0.5" />
                <span>
                  <strong>Troca obrigatória no 1º acesso:</strong> Ao fazer login com esta senha
                  provisória, o colaborador será direcionado imediatamente para definir sua senha
                  pessoal definitiva.
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

            {/* SEÇÃO: PERFIL DE COMISSÃO (Apenas visível para Vendedor / Gerente — Non-Commissionable Admin) */}
            {createRole !== 'admin' ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-900">
                  <Percent className="h-4 w-4 text-[#0F766E]" />
                  <span>Perfil de Comissão Inicial (Inbound, Outbound & Taxa de Implantação)</span>
                </div>

                <p className="text-[11px] text-teal-800 leading-relaxed">
                  Defina as alíquotas de remuneração deste colaborador. Você também poderá ajustar
                  ou personalizar individualmente na aba Regras de Comissão.
                </p>

                <div className="space-y-3 pt-1">
                  {/* Inbound */}
                  <div className="p-2.5 rounded-lg bg-white border border-teal-200 space-y-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Regra Inbound (Receptivo)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">Alíquota Vitalícia (%)</Label>
                        <Input
                          value={createInboundRate}
                          onChange={(e) => setCreateInboundRate(e.target.value)}
                          disabled={isSubmitting}
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">Taxa Implantação (%)</Label>
                        <Input
                          value={createInboundSetup}
                          onChange={(e) => setCreateInboundSetup(e.target.value)}
                          disabled={isSubmitting}
                          placeholder="Opcional"
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Outbound */}
                  <div className="p-2.5 rounded-lg bg-white border border-teal-200 space-y-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      Regra Outbound (Ativo)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">1º Ano (%)</Label>
                        <Input
                          value={createOutboundY1}
                          onChange={(e) => setCreateOutboundY1(e.target.value)}
                          disabled={isSubmitting}
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">2º Ano+ (%)</Label>
                        <Input
                          value={createOutboundY2}
                          onChange={(e) => setCreateOutboundY2(e.target.value)}
                          disabled={isSubmitting}
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">Taxa Implantação (%)</Label>
                        <Input
                          value={createOutboundSetup}
                          onChange={(e) => setCreateOutboundSetup(e.target.value)}
                          disabled={isSubmitting}
                          placeholder="Opcional"
                          className="h-8 text-xs tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />
                <span>
                  <strong>Perfil Não-Comissionável:</strong> Administradores possuem poderes totais
                  de gestão do sistema e não são comissionados por clientes ou faturamentos.
                </span>
              </div>
            )}

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
