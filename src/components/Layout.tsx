import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { getMonthlyRuns, getPendingBillings } from '@/services/commissionService'
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  BarChart3,
  LineChart,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  User,
  Percent,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Layout() {
  const { user, appUser, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number>(0)

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Fetch pending count for badge (admin / manager only)
  useEffect(() => {
    async function loadPendencies() {
      if (!appUser || appUser.role === 'sales') {
        setPendingCount(0)
        return
      }
      try {
        const runs = await getMonthlyRuns()
        const pendingRun = runs.find((r) => r.status === 'pending')
        if (pendingRun) {
          const pendingItems = await getPendingBillings(pendingRun.id)
          setPendingCount(pendingItems.length)
        } else {
          setPendingCount(0)
        }
      } catch (err) {
        console.error('Erro ao verificar pendências:', err)
      }
    }

    loadPendencies()
    const interval = setInterval(loadPendencies, 20000)
    return () => clearInterval(interval)
  }, [appUser, location.pathname])

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const roleLabels: Record<string, { label: string; color: string }> = {
    admin: {
      label: 'Administrador',
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    },
    manager: { label: 'Gerente', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
    sales: { label: 'Vendedor', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  }

  const isSales = appUser?.role === 'sales'

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      name: 'Dashboard de Faturamento',
      path: '/revenue-dashboard',
      icon: LineChart,
      visible: !isSales,
    },
    {
      name: 'Clientes',
      path: '/customers',
      icon: Building2,
      visible: true,
    },
    {
      name: 'Upload Mensal',
      path: '/upload',
      icon: Upload,
      visible: !isSales,
    },
    {
      name: 'Pendências',
      path: '/pendencies',
      icon: AlertTriangle,
      badge: pendingCount > 0 ? pendingCount : null,
      visible: !isSales,
    },
    {
      name: 'Relatórios',
      path: '/reports',
      icon: BarChart3,
      visible: true,
    },
    {
      name: 'Configurações',
      path: '/settings',
      icon: Settings,
      visible: !isSales,
    },
  ]

  const getPageTitle = () => {
    const p = location.pathname
    if (p.startsWith('/dashboard')) return 'Dashboard de Comissões'
    if (p.startsWith('/revenue-dashboard')) return 'Dashboard de Faturamento Corporativo'
    if (p.startsWith('/customers')) return 'Gestão de Clientes'
    if (p.startsWith('/upload')) return 'Upload Mensal de Faturamento'
    if (p.startsWith('/pendencies')) return 'Auditoria & Gatekeeper de Pendências'
    if (p.startsWith('/reports')) return 'Relatórios e Folha de Comissões'
    if (p.startsWith('/settings')) return 'Configurações do Sistema'
    return 'Controle de Comissões'
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row font-sans text-slate-800">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex w-64 bg-[#0F172A] flex-col justify-between shrink-0 shadow-xl z-20">
        <div>
          {/* Logo Brand */}
          <div className="h-20 flex items-center px-6 gap-3 border-b border-slate-800/80">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0F766E] to-[#14B8A6] flex items-center justify-center text-white shadow-md shadow-teal-900/30">
              <Percent className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-bold text-white text-base leading-tight tracking-tight">
                Controle de Comissões
              </div>
              <div className="text-xs text-slate-400 font-medium tracking-wide">
                B2B Gestão & Auditoria
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between px-3.5 py-3 rounded-lg text-sm font-medium transition-all group relative',
                        isActive
                          ? 'bg-slate-800/90 text-white shadow-sm border-l-4 border-[#14B8A6]'
                          : 'text-[#94A3B8] hover:text-white hover:bg-slate-800/50',
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110 text-slate-400 group-hover:text-teal-400" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge !== undefined && item.badge !== null && (
                      <span className="bg-amber-500 text-slate-950 text-xs px-2 py-0.5 rounded-full font-bold shadow-sm animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                )
              })}
          </nav>
        </div>

        {/* Bottom User info & Exit */}
        <div className="p-4 border-t border-slate-800/80 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex flex-col gap-1">
            <span className="text-slate-200 font-semibold truncate">
              {appUser?.name || user?.email}
            </span>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 capitalize">
                {appUser?.role || 'Usuário'}
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            </div>
          </div>

          <button
            onClick={() => setLogoutDialogOpen(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER OVERLAY */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#0F172A] p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-[#0F766E] flex items-center justify-center text-white">
                  <Percent className="h-5 w-5" />
                </div>
                <span className="font-bold text-sm tracking-tight">Controle de Comissões</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-4 space-y-1 flex-1">
              {navItems
                .filter((item) => item.visible)
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-slate-800 text-white border-l-4 border-[#14B8A6]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </div>
                      {item.badge !== undefined && item.badge !== null && (
                        <span className="bg-amber-500 text-slate-950 text-xs px-2 py-0.5 rounded-full font-bold">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
            </nav>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  setLogoutDialogOpen(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
              {getPageTitle()}
            </h1>
          </div>

          {/* User profile dropdown */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:outline-none">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0F766E] to-teal-800 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-slate-100">
                    {appUser?.name ? (
                      appUser.name.charAt(0).toUpperCase()
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div className="hidden md:flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-800 leading-tight">
                      {appUser?.name || 'Usuário'}
                    </span>
                    <span className="text-[11px] text-slate-500 capitalize">
                      {appUser?.role || 'Acesso'}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-1">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold text-slate-900 leading-none">
                      {appUser?.name || 'Usuário'}
                    </p>
                    <p className="text-xs text-slate-500 leading-none truncate">{user?.email}</p>
                    <div className="pt-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider',
                          roleLabels[appUser?.role || 'sales']?.color,
                        )}
                      >
                        {roleLabels[appUser?.role || 'sales']?.label || appUser?.role}
                      </Badge>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isSales && (
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="mr-2 h-4 w-4 text-slate-500" />
                    <span>Configurações</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setLogoutDialogOpen(true)}
                  className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* CONTENT VIEW */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 animate-in fade-in-50 duration-300">
          <Outlet />
        </main>

        {/* LIGHT FOOTER */}
        <footer className="border-t border-slate-200 bg-white/70 py-3 px-6 text-center text-xs text-slate-500">
          Sistema de Controle de Comissões B2B &copy; {new Date().getFullYear()} &bull; Globex
          Multimodal
        </footer>
      </div>

      {/* CONFIRM LOGOUT DIALOG */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja sair do sistema?</AlertDialogTitle>
            <AlertDialogDescription>
              Você precisará efetuar login novamente com seu e-mail e senha para acessar o painel de
              comissões.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sim, encerrar sessão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
