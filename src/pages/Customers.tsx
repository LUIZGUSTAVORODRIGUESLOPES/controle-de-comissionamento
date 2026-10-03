import { useState, useEffect, useMemo } from 'react'
import {
  getCustomers,
  getCustomerById,
  updateCustomer,
  listEligibleCommissionUsers,
  addUserToCustomer,
  removeUserFromCustomer,
} from '@/services/commissionService'
import type { Customer, CustomerOrigin, AppUser } from '@/types/database'
import { useToast } from '@/hooks/use-toast'
import {
  Search,
  Building2,
  Calendar as CalendarIcon,
  Users,
  Trash2,
  UserPlus,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BadgePercent,
  CalendarRange,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Customers() {
  const { toast } = useToast()

  // Main state
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [originFilter, setOriginFilter] = useState<'all' | 'inbound' | 'outbound'>('all')

  // Details & Edit Sheet State
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [fetchingDetails, setFetchingDetails] = useState(false)

  // Form states for the selected customer
  const [formName, setFormName] = useState('')
  const [formOrigin, setFormOrigin] = useState<CustomerOrigin>('inbound')
  const [formStartDate, setFormStartDate] = useState<string>('')
  const [formNoCommission, setFormNoCommission] = useState(false)
  const [savingChanges, setSavingChanges] = useState(false)

  // Users linking state
  const [eligibleUsers, setEligibleUsers] = useState<AppUser[]>([])
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState<string>('')
  const [addingUser, setAddingUser] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  // Load Customers
  const loadCustomers = async () => {
    setLoading(true)
    try {
      const data = await getCustomers(searchTerm)
      setCustomers(data)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao carregar clientes',
        description: err.message || 'Falha ao buscar registros de clientes.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Load Eligible Users for Linking (Manager & Sales)
  const loadEligibleUsers = async () => {
    try {
      const users = await listEligibleCommissionUsers()
      setEligibleUsers(users)
    } catch (err) {
      console.error('Erro ao carregar usuários elegíveis:', err)
    }
  }

  useEffect(() => {
    loadEligibleUsers()
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Filtered customers list (by origin filter on top of search)
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (originFilter === 'all') return true
      return c.origin === originFilter
    })
  }, [customers, originFilter])

  // Open Customer Details
  const handleOpenCustomer = async (cust: Customer) => {
    setSelectedCustomer(cust)
    setFormName(cust.name || '')
    setFormOrigin(cust.origin || 'inbound')
    setFormStartDate(cust.start_date || '')
    setFormNoCommission(cust.no_commission_flag || false)
    setSelectedUserIdToAdd('')
    setSheetOpen(true)

    // Refresh full details including customer_users
    setFetchingDetails(true)
    try {
      const fullCust = await getCustomerById(cust.id)
      if (fullCust) {
        setSelectedCustomer(fullCust)
        setFormName(fullCust.name || '')
        setFormOrigin(fullCust.origin || 'inbound')
        setFormStartDate(fullCust.start_date || '')
        setFormNoCommission(fullCust.no_commission_flag || false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setFetchingDetails(false)
    }
  }

  // Format date helper for table
  const formatDateDisplay = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    try {
      const parsed = parseISO(dateStr)
      if (!isValid(parsed)) return dateStr
      return format(parsed, 'dd/MM/yyyy')
    } catch {
      return dateStr
    }
  }

  // Selected date object for the Calendar DatePicker
  const calendarSelectedDate = useMemo(() => {
    if (!formStartDate) return undefined
    try {
      // YYYY-MM-DD
      const [year, month, day] = formStartDate.split('-').map(Number)
      if (year && month && day) {
        return new Date(year, month - 1, day)
      }
    } catch {
      return undefined
    }
    return undefined
  }, [formStartDate])

  const handleSelectDateFromCalendar = (date: Date | undefined) => {
    if (!date) return
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    setFormStartDate(`${yyyy}-${mm}-${dd}`)
  }

  // Save General Customer Changes
  const handleSaveChanges = async () => {
    if (!selectedCustomer) return
    if (!formName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'O nome do cliente não pode ficar em branco.',
        variant: 'destructive',
      })
      return
    }

    setSavingChanges(true)
    try {
      const updated = await updateCustomer(selectedCustomer.id, {
        name: formName.trim(),
        origin: formOrigin,
        start_date: formStartDate ? formStartDate : null,
        no_commission_flag: formNoCommission,
      })

      setSelectedCustomer(updated)

      // Update in local table list
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))

      toast({
        title: 'Cliente atualizado com sucesso!',
        description: `Dados de "${updated.name}" foram salvos no banco.`,
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar cliente',
        description: err.message || 'Falha ao atualizar dados no Supabase.',
        variant: 'destructive',
      })
    } finally {
      setSavingChanges(false)
    }
  }

  // Add linked user
  const handleAddUser = async () => {
    if (!selectedCustomer || !selectedUserIdToAdd) return

    // Avoid duplicate check
    const existingIds = (selectedCustomer.customer_users || []).map((cu) => cu.user_id)
    if (existingIds.includes(selectedUserIdToAdd)) {
      toast({
        title: 'Usuário já vinculado',
        description: 'Este vendedor ou gerente já está associado a este cliente.',
        variant: 'destructive',
      })
      return
    }

    setAddingUser(true)
    try {
      await addUserToCustomer(selectedCustomer.id, selectedUserIdToAdd)
      toast({
        title: 'Vendedor vinculado!',
        description: 'Usuário associado com sucesso ao cliente.',
      })
      setSelectedUserIdToAdd('')

      // Reload customer details
      const refreshed = await getCustomerById(selectedCustomer.id)
      if (refreshed) {
        setSelectedCustomer(refreshed)
        setCustomers((prev) =>
          prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)),
        )
      }
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao vincular',
        description: err.message || 'Falha ao adicionar vínculo de usuário.',
        variant: 'destructive',
      })
    } finally {
      setAddingUser(false)
    }
  }

  // Remove linked user
  const handleRemoveUser = async (customerUserId: string, userName?: string) => {
    if (!selectedCustomer) return
    setRemovingUserId(customerUserId)
    try {
      await removeUserFromCustomer(customerUserId)
      toast({
        title: 'Vínculo removido',
        description: userName ? `${userName} desvinculado com sucesso.` : 'Vínculo removido.',
      })

      // Reload customer details
      const refreshed = await getCustomerById(selectedCustomer.id)
      if (refreshed) {
        setSelectedCustomer(refreshed)
        setCustomers((prev) =>
          prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)),
        )
      }
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao remover vínculo',
        description: err.message || 'Falha ao remover vendedor.',
        variant: 'destructive',
      })
    } finally {
      setRemovingUserId(null)
    }
  }

  // Filter available users for selection (exclude already linked)
  const currentlyLinkedUserIds = useMemo(() => {
    return (selectedCustomer?.customer_users || []).map((cu) => cu.user_id)
  }, [selectedCustomer])

  const unlinkedEligibleUsers = useMemo(() => {
    return eligibleUsers.filter((u) => !currentlyLinkedUserIds.includes(u.id))
  }, [eligibleUsers, currentlyLinkedUserIds])

  return (
    <div className="space-y-6">
      {/* Top Banner & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-teal-50 text-[#0F766E] border border-teal-200 flex items-center justify-center font-bold">
              <Building2 className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Gestão de Clientes (Customer Management)
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Gerencie os dados cadastrais, regras de comissão (origem, data de início) e atribua
            executivos de vendas responsáveis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCustomers}
            disabled={loading}
            className="h-10 text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar cliente por Nome ou Código (ex: CLI-1001, TechLog)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 border-slate-300 focus-visible:ring-[#0F766E]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select
                value={originFilter}
                onValueChange={(val: 'all' | 'inbound' | 'outbound') => setOriginFilter(val)}
              >
                <SelectTrigger className="w-full sm:w-44 h-10 border-slate-300">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Origens</SelectItem>
                  <SelectItem value="inbound">Inbound (Receptivo)</SelectItem>
                  <SelectItem value="outbound">Outbound (Ativo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Customers Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Clientes Cadastrados ({filteredCustomers.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Clique em qualquer linha para abrir os detalhes, editar datas e gerenciar vendedores
              vinculados.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/70">
                <TableRow>
                  <TableHead className="w-32 font-bold text-slate-600">ID / Código</TableHead>
                  <TableHead className="font-bold text-slate-600">Nome do Cliente</TableHead>
                  <TableHead className="w-36 font-bold text-slate-600">Origem</TableHead>
                  <TableHead className="w-40 font-bold text-slate-600">Data de Início</TableHead>
                  <TableHead className="font-bold text-slate-600">Vendedores Vinculados</TableHead>
                  <TableHead className="w-32 font-bold text-slate-600">Comissão</TableHead>
                  <TableHead className="w-20 text-right font-bold text-slate-600">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-6 w-6 rounded-full border-2 border-[#0F766E] border-t-transparent animate-spin" />
                        <span className="text-xs text-slate-500">Carregando clientes...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-8 w-8 text-slate-300" />
                        <span className="font-semibold text-slate-700">
                          Nenhum cliente encontrado
                        </span>
                        <span className="text-xs text-slate-400">
                          Tente refazer a busca com outro termo ou alterar o filtro de origem.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((cust) => {
                    const links = cust.customer_users || []
                    const isNoComm = cust.no_commission_flag

                    return (
                      <TableRow
                        key={cust.id}
                        onClick={() => handleOpenCustomer(cust)}
                        className="cursor-pointer hover:bg-teal-50/40 transition-colors group"
                      >
                        <TableCell className="font-mono font-semibold text-xs text-slate-800">
                          <span className="bg-slate-100 group-hover:bg-teal-100/60 px-2 py-0.5 rounded text-slate-700 transition-colors">
                            {cust.customer_code}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 group-hover:text-[#0F766E] transition-colors">
                          {cust.name}
                        </TableCell>
                        <TableCell>
                          {cust.origin === 'inbound' ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold uppercase tracking-wider"
                            >
                              Inbound
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-semibold uppercase tracking-wider"
                            >
                              Outbound
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">
                          {formatDateDisplay(cust.start_date)}
                        </TableCell>
                        <TableCell>
                          {isNoComm ? (
                            <span className="text-xs text-slate-400 italic">
                              Dispensado (Sem comissão)
                            </span>
                          ) : links.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {links.map((link) => (
                                <Badge
                                  key={link.id}
                                  variant="outline"
                                  className="text-[11px] bg-slate-50 border-slate-200 text-slate-700 font-medium"
                                >
                                  {link.user?.name || 'Vendedor'}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Nenhum vendedor
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isNoComm ? (
                            <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 border-transparent text-[11px] font-semibold">
                              Sem Comissão
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-transparent text-[11px] font-semibold">
                              Ativa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 group-hover:text-[#0F766E]"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* CUSTOMER DETAILS & EDIT SHEET */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 space-y-6">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-teal-100 text-[#0F766E] border-teal-200 font-mono text-xs">
                {selectedCustomer?.customer_code}
              </Badge>
              <SheetTitle className="text-xl font-bold text-slate-900 truncate">
                {selectedCustomer?.name || 'Detalhes do Cliente'}
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs text-slate-500">
              Edite as informações cadastrais e vincule os executivos comerciais e gerentes
              responsáveis.
            </SheetDescription>
          </SheetHeader>

          {fetchingDetails && (
            <div className="p-3 bg-teal-50 rounded-lg text-xs text-teal-800 flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Sincronizando detalhes mais recentes do cliente...</span>
            </div>
          )}

          {/* SECTION 1: DADOS BÁSICOS & DATAS */}
          <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-white shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#0F766E]" />
              Dados do Cliente
            </h3>

            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="cust_name" className="text-xs font-semibold text-slate-700">
                Nome / Razão Social
              </Label>
              <Input
                id="cust_name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Razão social ou nome fantasia"
                className="h-10 text-sm border-slate-300"
              />
            </div>

            {/* Origem (Inbound / Outbound) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cust_origin" className="text-xs font-semibold text-slate-700">
                  Origem do Cliente
                </Label>
                <span className="text-[11px] text-slate-400">
                  Define a regra de comissão aplicada
                </span>
              </div>
              <Select
                value={formOrigin}
                onValueChange={(val: CustomerOrigin) => setFormOrigin(val)}
              >
                <SelectTrigger id="cust_origin" className="h-10 border-slate-300">
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">
                    Inbound (Lead receptivo &bull; Alíquota fixa/vitalícia)
                  </SelectItem>
                  <SelectItem value="outbound">
                    Outbound (Prospecção ativa &bull; Alíquota 1º ano vs 2º ano+)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data de Início (start_date) - Crítico para o Legado */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cust_start_date" className="text-xs font-semibold text-slate-700">
                  Data de Início do Contrato (start_date)
                </Label>
                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Crítico para cálculo 1º/2º ano
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  id="cust_start_date"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="h-10 flex-1 font-mono text-sm border-slate-300"
                />

                {/* Optional Popover Calendar */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 border-slate-300 text-slate-600 hover:text-slate-900"
                      title="Abrir calendário"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={calendarSelectedDate}
                      onSelect={handleSelectDateFromCalendar}
                      defaultMonth={calendarSelectedDate || new Date()}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Aceita qualquer data no passado (ex: 15/01/2023). O sistema calcula a diferença em
                meses até o mês apurado para determinar se a alíquota aplicada será a de 1º ano
                (&le; 12 meses) ou 2º ano+.
              </p>
            </div>

            {/* Flag Sem Comissão (no_commission_flag) */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="cust_no_comm"
                  className="text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Dispensar de Comissões (Sem Comissão)
                </Label>
                <p className="text-[11px] text-slate-500">
                  Quando ativo, este cliente não gerará comissão para nenhum vendedor em nenhum mês.
                </p>
              </div>
              <Switch
                id="cust_no_comm"
                checked={formNoCommission}
                onCheckedChange={setFormNoCommission}
              />
            </div>

            {/* Botão Salvar Dados Básicos */}
            <div className="pt-2 flex justify-end">
              <Button
                onClick={handleSaveChanges}
                disabled={savingChanges}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-xs h-9 px-4 gap-2 shadow-xs"
              >
                {savingChanges ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Salvar Alterações do Cliente</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* SECTION 2: GESTÃO DE VÍNCULOS DE VENDEDORES (customer_users) */}
          <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#0F766E]" />
                  Vendedores & Gerentes Vinculados
                </h3>
                <p className="text-xs text-slate-500">
                  Usuários que recebem comissão calculada sobre o faturamento líquido deste cliente.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono font-bold">
                {(selectedCustomer?.customer_users || []).length} vinculado(s)
              </Badge>
            </div>

            {/* List of currently linked users */}
            <div className="space-y-2">
              {(selectedCustomer?.customer_users || []).length === 0 ? (
                <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Nenhum executivo vinculado. Se este cliente faturar e não estiver dispensado,
                    bloqueará o fechamento mensal no Gatekeeper de Pendências.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {(selectedCustomer?.customer_users || []).map((link) => {
                    const u = link.user
                    const isRemoving = removingUserId === link.id

                    return (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-teal-100 text-[#0F766E] flex items-center justify-center font-bold text-xs uppercase">
                            {u?.name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {u?.name || 'Usuário'}
                            </p>
                            <p className="text-[11px] text-slate-500">{u?.email || '-'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-semibold text-slate-600 bg-white"
                          >
                            {u?.role === 'manager' ? 'Gerente' : 'Vendedor'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isRemoving}
                            onClick={() => handleRemoveUser(link.id, u?.name)}
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Remover vínculo"
                          >
                            {isRemoving ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Form to Add New User Link */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <Label className="text-xs font-semibold text-slate-700">
                Vincular Novo Vendedor ou Gerente
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedUserIdToAdd}
                  onValueChange={setSelectedUserIdToAdd}
                  disabled={addingUser || unlinkedEligibleUsers.length === 0}
                >
                  <SelectTrigger className="flex-1 h-10 border-slate-300 text-xs">
                    <SelectValue
                      placeholder={
                        unlinkedEligibleUsers.length === 0
                          ? 'Todos os usuários disponíveis já estão vinculados'
                          : 'Selecione o usuário para vincular...'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedEligibleUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id} className="text-xs">
                        {user.name} ({user.role === 'manager' ? 'Gerente' : 'Vendedor'}) &bull;{' '}
                        {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleAddUser}
                  disabled={!selectedUserIdToAdd || addingUser}
                  className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold h-10 px-4 gap-1.5 shrink-0"
                >
                  {addingUser ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  <span>Vincular</span>
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
