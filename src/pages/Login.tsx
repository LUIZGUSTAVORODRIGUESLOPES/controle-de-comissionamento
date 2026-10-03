import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Percent,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { loginSchema, LoginFormData } from '@/lib/auth-schemas'
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

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'luiz@globexmultimodal.com.br',
      password: 'Skip@Pass',
    },
    mode: 'onTouched',
  })

  const { isSubmitting } = form.formState
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null)

    try {
      const { error } = await signIn(data.email.trim(), data.password)
      if (error) {
        // SEGURANÇA B2B: Prevenção de Enumeração de Usuários.
        // Mensagem genérica estrita conforme requisito do usuário:
        // "E-mail ou palavra-passe inválidos"
        setErrorMessage('E-mail ou palavra-passe inválidos')
      } else {
        navigate(from, { replace: true })
      }
    } catch {
      // Falha genérica mesmo em caso de exceção de rede ou timeout
      setErrorMessage('E-mail ou palavra-passe inválidos')
    }
  }

  const handleSelectDemoUser = (demoEmail: string, demoPass: string) => {
    form.setValue('email', demoEmail, { shouldValidate: true })
    form.setValue('password', demoPass, { shouldValidate: true })
    setErrorMessage(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F766E]/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0F766E] to-[#14B8A6] text-white shadow-xl shadow-teal-950/40">
            <Percent className="h-8 w-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Controle de Comissões</h1>
          <p className="text-sm text-slate-300">
            Plataforma B2B de Gestão e Apuração de Comissionamentos
          </p>
        </div>

        <Card className="border-slate-800 bg-white/95 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold text-slate-900">Entrar no Sistema</CardTitle>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" />
                Acesso Seguro
              </span>
            </div>
            <CardDescription className="text-slate-500">
              Digite seu e-mail corporativo e senha para acessar o painel.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {errorMessage && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm animate-in fade-in"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                    <span className="leading-tight font-medium">{errorMessage}</span>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        E-mail Corporativo
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Input
                            type="email"
                            autoComplete="email"
                            disabled={isSubmitting}
                            placeholder="usuario@empresa.com.br"
                            className="pl-9 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-rose-600 font-medium" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Palavra-passe
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Input
                            type="password"
                            autoComplete="current-password"
                            disabled={isSubmitting}
                            placeholder="••••••••"
                            className="pl-9 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-rose-600 font-medium" />
                    </FormItem>
                  )}
                />

                {/* Aviso B2B de acesso restrito (sem cadastro público) */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 text-[#0F766E] shrink-0 mt-0.5" />
                  <span>
                    Acesso exclusivo para colaboradores convidados pelo Administrador. Não é
                    permitido cadastro público.
                  </span>
                </div>

                {/* Botão de submit com proteção contra múltiplos cliques e spinner */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold transition-all hover:scale-[1.01] shadow-md shadow-teal-900/20 disabled:cursor-not-allowed disabled:opacity-75"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Autenticando com segurança...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Entrar</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="flex flex-col border-t border-slate-100 bg-slate-50/70 p-4 rounded-b-xl gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Contas de Demonstração (Clique para preencher)
            </span>
            <div className="grid grid-cols-1 gap-2 w-full">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelectDemoUser('luiz@globexmultimodal.com.br', 'Skip@Pass')}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors group disabled:opacity-50"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Luiz Fernandes (Admin/Diretor)</span>
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  </div>
                  <div className="text-[11px] text-slate-500">luiz@globexmultimodal.com.br</div>
                </div>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  Admin
                </span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelectDemoUser('carlos.gerente@empresa.com', 'Skip@Pass')}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors disabled:opacity-50"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800">Carlos Silva (Gerente)</div>
                  <div className="text-[11px] text-slate-500">carlos.gerente@empresa.com</div>
                </div>
                <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                  Manager
                </span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelectDemoUser('mariana.vendas@empresa.com', 'Skip@Pass')}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors disabled:opacity-50"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Mariana Santos (Executiva Vendas)
                  </div>
                  <div className="text-[11px] text-slate-500">mariana.vendas@empresa.com</div>
                </div>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  Vendedor
                </span>
              </button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
