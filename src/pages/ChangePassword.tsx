import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, ShieldAlert, ArrowRight, Eye, EyeOff, LogOut, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { changePasswordSchema, ChangePasswordFormData } from '@/lib/auth-schemas'
import { PasswordStrengthChecklist } from '@/components/PasswordStrengthChecklist'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'

export default function ChangePassword() {
  const { user, appUser, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onChange',
  })

  const watchedNewPassword = form.watch('newPassword')
  const { isSubmitting } = form.formState

  const onSubmit = async (data: ChangePasswordFormData) => {
    setApiError(null)

    if (!user || !user.email) {
      setApiError('Sessão de utilizador não identificada. Faça login novamente.')
      return
    }

    try {
      // 1. Validar a senha atual autenticando com ela (para garantir que o usuário realmente a conhece)
      const { error: testSignInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword,
      })

      if (testSignInError) {
        setApiError('A palavra-passe atual informada está incorreta.')
        return
      }

      // 2. Atualizar a senha no Supabase Auth via API oficial do usuário autenticado
      const { error: updateAuthError } = await supabase.auth.updateUser({
        password: data.newPassword,
      })

      if (updateAuthError) {
        setApiError(updateAuthError.message || 'Falha ao atualizar a palavra-passe.')
        return
      }

      // 3. Desmarcar a flag must_change_password no perfil público do usuário
      const { error: updateProfileError } = await (supabase as any)
        .from('users')
        .update({ must_change_password: false })
        .eq('id', user.id)

      if (updateProfileError) {
        console.warn('Aviso ao atualizar perfil público:', updateProfileError)
      }

      // 4. Atualizar o perfil no contexto de autenticação
      await refreshProfile()

      toast({
        title: 'Palavra-passe alterada com sucesso!',
        description: 'Sua nova senha foi cadastrada e você tem acesso total ao painel.',
      })

      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setApiError(err.message || 'Ocorreu um erro ao atualizar sua palavra-passe.')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F766E]/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xl shadow-amber-950/40">
            <KeyRound className="h-8 w-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Alteração Obrigatória de Palavra-passe
          </h1>
          <p className="text-sm text-slate-300">
            Por política de segurança B2B, você deve definir sua palavra-passe pessoal definitiva.
          </p>
        </div>

        <Card className="border-slate-800 bg-white/95 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-900">
                Cadastrar Nova Palavra-passe
              </CardTitle>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full">
                <ShieldAlert className="h-3 w-3 text-amber-700" />
                Troca Obrigatória
              </span>
            </div>
            <CardDescription className="text-slate-500 text-xs">
              Olá, <strong>{appUser?.name || user?.email}</strong>. Crie uma senha forte e
              memorize-a.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {apiError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs animate-in fade-in"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                    <span className="leading-tight font-medium">{apiError}</span>
                  </div>
                )}

                {/* Senha Atual */}
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Palavra-passe Atual (Provisória)
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showCurrentPass ? 'text' : 'password'}
                            autoComplete="current-password"
                            disabled={isSubmitting}
                            placeholder="Digite a senha recebida"
                            className="pr-10 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPass(!showCurrentPass)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                          >
                            {showCurrentPass ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-rose-600 font-medium" />
                    </FormItem>
                  )}
                />

                {/* Nova Senha */}
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Nova Palavra-passe
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showNewPass ? 'text' : 'password'}
                            autoComplete="new-password"
                            disabled={isSubmitting}
                            placeholder="Digite sua nova senha forte"
                            className="pr-10 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPass(!showNewPass)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                          >
                            {showNewPass ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-rose-600 font-medium" />
                    </FormItem>
                  )}
                />

                {/* Confirmar Nova Senha */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Confirmar Nova Palavra-passe
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPass ? 'text' : 'password'}
                            autoComplete="new-password"
                            disabled={isSubmitting}
                            placeholder="Repita a nova senha"
                            className="pr-10 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPass(!showConfirmPass)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                          >
                            {showConfirmPass ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-rose-600 font-medium" />
                    </FormItem>
                  )}
                />

                {/* Checklist com regras de senha forte */}
                <PasswordStrengthChecklist password={watchedNewPassword || ''} />

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold transition-all hover:scale-[1.01] shadow-md shadow-teal-900/20 disabled:cursor-not-allowed disabled:opacity-75"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando nova palavra-passe...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Salvar e Acessar o Sistema</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-4 rounded-b-xl">
            <span className="text-[11px] text-slate-500">Precisa sair ou usar outra conta?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={isSubmitting}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Encerrar Sessão</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
