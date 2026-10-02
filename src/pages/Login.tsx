import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Percent, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('luiz@globexmultimodal.com.br')
  const [password, setPassword] = useState('Skip@Pass')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)

    try {
      const { error } = await signIn(email.trim(), password)
      if (error) {
        if (error.message?.includes('Invalid login credentials')) {
          setErrorMessage('Credenciais inválidas. Verifique seu e-mail e senha.')
        } else {
          setErrorMessage(error.message || 'Falha ao autenticar. Tente novamente.')
        }
      } else {
        navigate(from, { replace: true })
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado na conexão.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDemoUser = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail)
    setPassword(demoPass)
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
            <CardTitle className="text-xl font-bold text-slate-900">Entrar no Sistema</CardTitle>
            <CardDescription className="text-slate-500">
              Digite seu e-mail corporativo e senha para acessar o painel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-tight">{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  E-mail Corporativo
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="usuario@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
                  >
                    Senha
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-10 border-slate-200 focus-visible:ring-[#0F766E]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold transition-all hover:scale-[1.01] shadow-md shadow-teal-900/20"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Entrar</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col border-t border-slate-100 bg-slate-50/70 p-4 rounded-b-xl gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Contas de Demonstração (Clique para preencher)
            </span>
            <div className="grid grid-cols-1 gap-2 w-full">
              <button
                type="button"
                onClick={() => handleSelectDemoUser('luiz@globexmultimodal.com.br', 'Skip@Pass')}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors group"
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
                onClick={() => handleSelectDemoUser('carlos.gerente@empresa.com', 'Skip@Pass')}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors"
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
                onClick={() => handleSelectDemoUser('mariana.vendas@empresa.com', 'Skip@Pass')}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors"
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
