import { useState, useEffect, useMemo } from 'react'
import {
  getCustomers,
  getCustomerById,
  updateCustomer,
  listEligibleCommissionUsers,
  addUserToCustomer,
  removeUserFromCustomer,
  bulkUpdateCustomers,
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
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Edit3,
  CheckSquare,
  Square,
  X,
  UserCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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

  // Bulk Selection State
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkSelectedUserIds, setBulkSelectedUserIds] = useState<string[]>([])
  const [bulkUserRules, setBulkUserRules] = useState<Record<string, string>>({})
  const [bulkReplaceUsers, setBulkReplaceUsers] = useState(false)
  const [bulkNoCommission, setBulkNoCommission] = useState<'keep' | 'yes' | 'no'>('keep')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Safety confirmation dialog state for clients with no_commission_flag = true
  const [confirmSafetyOpen, setConfirmSafetyOpen] = useState(false)
  const [noCommCustomersCount, setNoCommCustomersCount] = useState(0)

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
  const [selectedRuleToAdd, setSelectedRuleToAdd] = useState<string>('inbound')
  const [selectedValidFromToAdd, setSelectedValidFromToAdd] = useState<string>(
    new Date().toISOString().split('T')[0],
  )
  const [selectedValidUntilToAdd, setSelectedValidUntilToAdd] = useState<string>('')
  const [bulkValidFrom, setBulkValidFrom] = useState<string>(new Date().toISOString().split('T')[0])
  const [bulkValidUntil, setBulkValidUntil] = useState<string>('')
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

  // Checkbox Selection Logic
  const allFilteredSelected = useMemo(() => {
    if (filteredCustomers.length === 0) return false
    return filteredCustomers.every((c) => selectedCustomerIds.includes(c.id))
  }, [filteredCustomers, selectedCustomerIds])

  const someFilteredSelected = useMemo(() => {
    if (filteredCustomers.length === 0) return false
    const count = filteredCustomers.filter((c) => selectedCustomerIds.includes(c.id)).length
    return count > 0 && count < filteredCustomers.length
  }, [filteredCustomers, selectedCustomerIds])

  const handleToggleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const visibleIds = filteredCustomers.map((c) => c.id)
      setSelectedCustomerIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    } else {
      const visibleIdSet = new Set(filteredCustomers.map((c) => c.id))
      setSelectedCustomerIds((prev) => prev.filter((id) => !visibleIdSet.has(id)))
    }
  }

  const handleToggleCustomerSelect = (id: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedCustomerIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    } else {
      setSelectedCustomerIds((prev) => prev.filter((item) => item !== id))
    }
  }

  const handleClearSelection = () => {
    setSelectedCustomerIds([])
  }

  const handleOpenBulkModal = () => {
    setBulkSelectedUserIds([])
    setBulkUserRules({})
    setBulkReplaceUsers(false)
    setBulkValidFrom(new Date().toISOString().split('T')[0])
    setBulkValidUntil('')
    setBulkNoCommission('keep')
    setBulkModalOpen(true)
  }

  const handleToggleBulkUser = (userId: string) => {
    setBulkSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId)
      } else {
        // When checking, set default rule if not yet chosen
        setBulkUserRules((rules) => ({
          ...rules,
          [userId]: rules[userId] || 'inbound',
        }))
        return [...prev, userId]
      }
    })
  }

  const handleSetUserRule = (userId: string, rule: string) => {
    setBulkUserRules((prev) => ({
      ...prev,
      [userId]: rule,
    }))
  }

  const handleSelectAllBulkUsers = () => {
    if (bulkSelectedUserIds.length === eligibleUsers.length) {
      setBulkSelectedUserIds([])
    } else {
      const allIds = eligibleUsers.map((u) => u.id)
      setBulkSelectedUserIds(allIds)
      setBulkUserRules((prev) => {
        const next = { ...prev }
        allIds.forEach((id) => {
          if (!next[id]) next[id] = 'inbound'
        })
        return next
      })
    }
  }

  // Pre-submit check: Safety Dialog for "Sem Comissão"
  const handlePreSubmitBulkUpdate = () => {
    if (selectedCustomerIds.length === 0) return

    // Count how many of the selected customers currently have no_commission_flag = true
    const selectedCustomersObj = customers.filter((c) => selectedCustomerIds.includes(c.id))
    const noCommCount = selectedCustomersObj.filter((c) => c.no_commission_flag === true).length

    // Check if the form is activating commission (bulkNoCommission === 'no') OR adding links (bulkSelectedUserIds.length > 0)
    const isActivatingCommission = bulkNoCommission === 'no'
    const isAddingLinks = bulkSelectedUserIds.length > 0

    if (noCommCount > 0 && (isActivatingCommission || isAddingLinks)) {
      setNoCommCustomersCount(noCommCount)
      setConfirmSafetyOpen(true)
      return
    }

    // Otherwise, proceed directly
    executeBulkUpdate()
  }

  const executeBulkUpdate = async () => {
    if (selectedCustomerIds.length === 0) return

    setBulkSaving(true)
    toast({
      title: 'Atualizando clientes em lote...',
      description: `Aplicando alterações para ${selectedCustomerIds.length} cliente(s) selecionado(s). Aguarde...`,
    })

    try {
      // Build usersWithRules payload for selected users
      const usersWithRules = bulkSelectedUserIds
        .filter((uid) => Boolean(bulkUserRules[uid]))
        .map((uid) => ({
          user_id: uid,
          commission_type: bulkUserRules[uid] || 'inbound',
        }))

      const payload: {
        customerIds: string[]
        noCommissionFlag?: boolean
        usersWithRules?: Array<{
          user_id: string
          commission_type: string
          valid_from?: string
          valid_until?: string | null
        }>
        validFrom?: string
        validUntil?: string | null
        replaceUsers?: boolean
      } = {
        customerIds: selectedCustomerIds,
        validFrom: bulkValidFrom || new Date().toISOString().split('T')[0],
        validUntil: bulkValidUntil || null,
      }

      if (bulkNoCommission === 'yes') {
        payload.noCommissionFlag = true
      } else if (bulkNoCommission === 'no') {
        payload.noCommissionFlag = false
      }

      // If user selected users to link or marked replace mode
      if (usersWithRules.length > 0 || bulkReplaceUsers) {
        payload.usersWithRules = usersWithRules
        payload.replaceUsers = bulkReplaceUsers
      }

      await bulkUpdateCustomers(payload)

      toast({
        title: 'Atualização em massa concluída!',
        description: `${selectedCustomerIds.length} cliente(s) atualizado(s) com sucesso.`,
      })

      setBulkModalOpen(false)
      setSelectedCustomerIds([])
      await loadCustomers()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro na atualização em massa',
        description: err.message || 'Falha ao aplicar alterações em lote.',
        variant: 'destructive',
      })
    } finally {
      setBulkSaving(false)
    }
  }

  // Open Customer Details
  const handleOpenCustomer = async (cust: Customer) => {
    setSelectedCustomer(cust)
    setFormName(cust.name || '')
    setFormOrigin(cust.origin || 'inbound')
    setFormStartDate(cust.start_date || '')
    setFormNoCommission(cust.no_commission_flag || false)
    setSelectedUserIdToAdd('')
    setSelectedRuleToAdd('inbound')
    setSelectedValidFromToAdd(new Date().toISOString().split('T')[0])
    setSelectedValidUntilToAdd('')
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

    if (!selectedValidFromToAdd) {
      toast({
        title: 'Data de início obrigatória',
        description: 'Informe o campo "Vigente a partir de:" para registrar a vigência do vínculo.',
        variant: 'destructive',
      })
      return
    }

    setAddingUser(true)
    try {
      await addUserToCustomer(
        selectedCustomer.id,
        selectedUserIdToAdd,
        selectedRuleToAdd,
        selectedValidFromToAdd,
        selectedValidUntilToAdd || null,
      )
      toast({
        title: 'Vendedor vinculado!',
        description: `Usuário associado com sucesso ao cliente com regra "${selectedRuleToAdd.toUpperCase()}" e vigência a partir de ${formatDateDisplay(selectedValidFromToAdd)}.`,
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

      {/* Bulk Actions Floating Bar / Toolbar */}
      {selectedCustomerIds.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0F766E] flex items-center justify-center font-bold text-white text-xs shrink-0">
              {selectedCustomerIds.length}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {selectedCustomerIds.length} cliente{selectedCustomerIds.length > 1 ? 's' : ''}{' '}
                selecionado{selectedCustomerIds.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-400">
                Atribua gerentes, mude a regra de comissão ou gerencie a carteira em massa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              className="h-9 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpar seleção
            </Button>
            <Button
              size="sm"
              onClick={handleOpenBulkModal}
              className="h-9 text-xs font-semibold bg-[#0F766E] hover:bg-[#115E59] text-white gap-2 shadow-sm"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Editar {selectedCustomerIds.length} Clientes Selecionados</span>
            </Button>
          </div>
        </div>
      )}

      {/* Main Customers Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Clientes Cadastrados ({filteredCustomers.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Selecione múltiplos clientes para editar em massa ou clique na linha para abrir os
              detalhes individuais.
            </CardDescription>
          </div>
          {selectedCustomerIds.length > 0 && (
            <Button
              size="sm"
              onClick={handleOpenBulkModal}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold gap-1.5 h-8"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Editar {selectedCustomerIds.length} Clientes Selecionados</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/70">
                <TableRow>
                  <TableHead className="w-12 px-3 text-center">
                    <Checkbox
                      checked={
                        allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={handleToggleSelectAll}
                      aria-label="Selecionar todos os clientes visíveis"
                      className="translate-y-[2px]"
                    />
                  </TableHead>
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
                    <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-6 w-6 rounded-full border-2 border-[#0F766E] border-t-transparent animate-spin" />
                        <span className="text-xs text-slate-500">Carregando clientes...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-500">
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
                    const isSelected = selectedCustomerIds.includes(cust.id)

                    return (
                      <TableRow
                        key={cust.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className={`cursor-pointer transition-colors group ${
                          isSelected ? 'bg-teal-50/80 hover:bg-teal-100/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <TableCell
                          className="w-12 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleToggleCustomerSelect(cust.id, checked)
                            }
                            aria-label={`Selecionar cliente ${cust.name}`}
                            className="translate-y-[2px]"
                          />
                        </TableCell>
                        <TableCell
                          onClick={() => handleOpenCustomer(cust)}
                          className="font-mono font-semibold text-xs text-slate-800"
                        >
                          <span className="bg-slate-100 group-hover:bg-teal-100/60 px-2 py-0.5 rounded text-slate-700 transition-colors">
                            {cust.customer_code}
                          </span>
                        </TableCell>
                        <TableCell
                          onClick={() => handleOpenCustomer(cust)}
                          className="font-medium text-slate-900 group-hover:text-[#0F766E] transition-colors"
                        >
                          {cust.name}
                        </TableCell>
                        <TableCell onClick={() => handleOpenCustomer(cust)}>
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
                        <TableCell
                          onClick={() => handleOpenCustomer(cust)}
                          className="text-xs text-slate-600 font-mono"
                        >
                          {formatDateDisplay(cust.start_date)}
                        </TableCell>
                        <TableCell onClick={() => handleOpenCustomer(cust)}>
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
                                  {link.commission_type && (
                                    <span className="ml-1 text-[10px] text-teal-700 uppercase">
                                      ({link.commission_type})
                                    </span>
                                  )}
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
                        <TableCell onClick={() => handleOpenCustomer(cust)}>
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
                        <TableCell className="text-right" onClick={() => handleOpenCustomer(cust)}>
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
                            className="text-[10px] uppercase font-semibold text-teal-800 bg-teal-50 border-teal-200"
                          >
                            {link.commission_type || 'inbound'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-semibold text-slate-600 bg-white"
                          >
                            {u?.role === 'manager' ? 'Gerente' : 'Vendedor'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono text-slate-600 bg-slate-50"
                            title="Vigência do vínculo"
                          >
                            {link.valid_from
                              ? formatDateDisplay(link.valid_from)
                              : 'Desde o início'}
                            {link.valid_until
                              ? ` até ${formatDateDisplay(link.valid_until)}`
                              : ' em diante'}
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
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <Label className="text-xs font-semibold text-slate-700">
                Vincular Novo Vendedor ou Gerente com Regra e Vigência
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-500">Usuário</Label>
                  <Select
                    value={selectedUserIdToAdd}
                    onValueChange={setSelectedUserIdToAdd}
                    disabled={addingUser || unlinkedEligibleUsers.length === 0}
                  >
                    <SelectTrigger className="w-full h-10 border-slate-300 text-xs mt-1">
                      <SelectValue
                        placeholder={
                          unlinkedEligibleUsers.length === 0
                            ? 'Todos já vinculados'
                            : 'Selecione o usuário...'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedEligibleUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id} className="text-xs">
                          {user.name} ({user.role === 'manager' ? 'Gerente' : 'Vendedor'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-500">Regra de Comissão</Label>
                  <Select
                    value={selectedRuleToAdd}
                    onValueChange={setSelectedRuleToAdd}
                    disabled={addingUser || !selectedUserIdToAdd}
                  >
                    <SelectTrigger className="w-full h-10 border-slate-300 text-xs mt-1">
                      <SelectValue placeholder="Regra..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound" className="text-xs">
                        Inbound
                      </SelectItem>
                      <SelectItem value="outbound" className="text-xs">
                        Outbound
                      </SelectItem>
                      <SelectItem value="fixed" className="text-xs">
                        Fixo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* DatePicker Obrigatório de Vigência: Vigente a partir de: */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    <span>Vigente a partir de:</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={selectedValidFromToAdd}
                      onChange={(e) => setSelectedValidFromToAdd(e.target.value)}
                      required
                      className="h-10 text-xs border-slate-300 focus-visible:ring-[#0F766E]"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 border-slate-300 shrink-0 text-slate-600 hover:text-[#0F766E]"
                          title="Selecionar data no calendário"
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            selectedValidFromToAdd ? parseISO(selectedValidFromToAdd) : undefined
                          }
                          onSelect={(d) => {
                            if (d) {
                              const y = d.getFullYear()
                              const m = String(d.getMonth() + 1).padStart(2, '0')
                              const day = String(d.getDate()).padStart(2, '0')
                              setSelectedValidFromToAdd(`${y}-${m}-${day}`)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span>Vigente até:</span>
                    <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={selectedValidUntilToAdd}
                      onChange={(e) => setSelectedValidUntilToAdd(e.target.value)}
                      placeholder="Indeterminado"
                      className="h-10 text-xs border-slate-300 focus-visible:ring-[#0F766E]"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 border-slate-300 shrink-0 text-slate-600 hover:text-[#0F766E]"
                          title="Selecionar data final no calendário"
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            selectedValidUntilToAdd ? parseISO(selectedValidUntilToAdd) : undefined
                          }
                          onSelect={(d) => {
                            if (d) {
                              const y = d.getFullYear()
                              const m = String(d.getMonth() + 1).padStart(2, '0')
                              const day = String(d.getDate()).padStart(2, '0')
                              setSelectedValidUntilToAdd(`${y}-${m}-${day}`)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleAddUser}
                  disabled={!selectedUserIdToAdd || !selectedValidFromToAdd || addingUser}
                  className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold h-10 px-5 gap-1.5"
                >
                  {addingUser ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  <span>Vincular Vendedor</span>
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* BULK EDIT MODAL / DIALOG */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="text-left space-y-1 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Badge className="bg-teal-100 text-[#0F766E] border-teal-200 text-xs font-semibold">
                Edição em Massa
              </Badge>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Editar {selectedCustomerIds.length} Clientes Selecionados
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Altere a origem (regra de comissionamento) e reatribua a carteira de vendedores e
              gerentes de dezenas de clientes em uma única operação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* 1. Bloco de Usuários (Vincular Vendedores / Gerentes) */}
            <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-[#0F766E]" />
                    Vincular Vendedores / Gerentes
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Selecione os responsáveis e especifique a regra de comissionamento individual de
                    cada um para os {selectedCustomerIds.length} clientes.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllBulkUsers}
                    className="h-7 text-xs text-[#0F766E] hover:text-[#115E59] px-2 font-medium"
                  >
                    {bulkSelectedUserIds.length === eligibleUsers.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </Button>
                  <Badge variant="outline" className="text-xs font-mono font-bold">
                    {bulkSelectedUserIds.length} selecionado(s)
                  </Badge>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50/40">
                {eligibleUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2 text-center">
                    Nenhum usuário com papel manager ou sales encontrado.
                  </p>
                ) : (
                  eligibleUsers.map((user) => {
                    const isChecked = bulkSelectedUserIds.includes(user.id)
                    const userRule = bulkUserRules[user.id] || 'inbound'

                    return (
                      <div
                        key={user.id}
                        className={`rounded-lg border transition-all ${
                          isChecked
                            ? 'bg-teal-50/60 border-teal-300 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <div
                          onClick={() => handleToggleBulkUser(user.id)}
                          className="flex items-center justify-between p-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => handleToggleBulkUser(user.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Selecionar ${user.name}`}
                            />
                            <div>
                              <p className="text-xs font-semibold text-slate-900">{user.name}</p>
                              <p className="text-[11px] text-slate-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase font-semibold text-slate-600 bg-white"
                            >
                              {user.role === 'manager' ? 'Gerente' : 'Vendedor'}
                            </Badge>
                          </div>
                        </div>

                        {/* Seleção de Perfil (NOVO): Expandido quando o usuário está marcado */}
                        {isChecked && (
                          <div
                            className="px-3 pb-3 pt-1 border-t border-teal-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-teal-100/30 rounded-b-lg animate-in fade-in slide-in-from-top-1 duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Label
                              htmlFor={`rule-select-${user.id}`}
                              className="text-xs font-semibold text-teal-950 flex items-center gap-1"
                            >
                              <span>Qual regra aplicar?</span>
                              <span className="text-rose-500">*</span>
                            </Label>
                            <Select
                              value={userRule}
                              onValueChange={(val) => handleSetUserRule(user.id, val)}
                            >
                              <SelectTrigger
                                id={`rule-select-${user.id}`}
                                className="w-full sm:w-56 h-8 text-xs bg-white border-teal-300 font-medium focus:ring-teal-500"
                              >
                                <SelectValue placeholder="Selecione a regra..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inbound" className="text-xs">
                                  Inbound (Lead receptivo &bull; Alíquota fixa)
                                </SelectItem>
                                <SelectItem value="outbound" className="text-xs">
                                  Outbound (Prospecção ativa &bull; 1º vs 2º ano)
                                </SelectItem>
                                <SelectItem value="fixed" className="text-xs">
                                  Fixo (Regra fixa de comissão)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Vigência em Lote (DatePicker Obrigatório: Vigente a partir de) */}
              <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-[#0F766E]" />
                    <span>Período de Vigência da Atribuição</span>
                  </Label>
                  <span className="text-[10px] text-teal-700 font-medium">
                    Aplica a todos selecionados
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                      <span>Vigente a partir de:</span>
                      <span className="text-rose-500">*</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={bulkValidFrom}
                        onChange={(e) => setBulkValidFrom(e.target.value)}
                        required
                        className="h-9 text-xs bg-white border-teal-300 focus-visible:ring-[#0F766E]"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 bg-white border-teal-300 shrink-0 text-slate-600 hover:text-[#0F766E]"
                            title="Selecionar data no calendário"
                          >
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={bulkValidFrom ? parseISO(bulkValidFrom) : undefined}
                            onSelect={(d) => {
                              if (d) {
                                const y = d.getFullYear()
                                const m = String(d.getMonth() + 1).padStart(2, '0')
                                const day = String(d.getDate()).padStart(2, '0')
                                setBulkValidFrom(`${y}-${m}-${day}`)
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                      <span>Vigente até:</span>
                      <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={bulkValidUntil}
                        onChange={(e) => setBulkValidUntil(e.target.value)}
                        placeholder="Indeterminado"
                        className="h-9 text-xs bg-white border-teal-300 focus-visible:ring-[#0F766E]"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 bg-white border-teal-300 shrink-0 text-slate-600 hover:text-[#0F766E]"
                            title="Selecionar data final no calendário"
                          >
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={bulkValidUntil ? parseISO(bulkValidUntil) : undefined}
                            onSelect={(d) => {
                              if (d) {
                                const y = d.getFullYear()
                                const m = String(d.getMonth() + 1).padStart(2, '0')
                                const day = String(d.getDate()).padStart(2, '0')
                                setBulkValidUntil(`${y}-${m}-${day}`)
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modo de Substituição */}
              <div className="mt-3 p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="bulk_replace"
                    checked={bulkReplaceUsers}
                    onCheckedChange={(checked) => setBulkReplaceUsers(checked === true)}
                    className="mt-0.5 border-amber-400 data-[state=checked]:bg-amber-700 data-[state=checked]:border-amber-700"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="bulk_replace"
                      className="text-xs font-bold text-amber-950 cursor-pointer flex items-center gap-1.5"
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      Substituir carteira existente?
                    </Label>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      <strong>Marcado:</strong> apaga os vínculos antigos destes clientes e insere
                      apenas os novos selecionados acima com suas respectivas regras.
                      <br />
                      <strong>Desmarcado:</strong> apenas adiciona ou atualiza os vínculos para os
                      vendedores selecionados, preservando os outros que já estavam vinculados.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Flag Sem Comissão (opcional) */}
            <div className="space-y-1.5 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk_nocomm" className="text-xs font-bold text-slate-800">
                  Status de Comissão (Dispensar de Comissões)
                </Label>
                <span className="text-[11px] text-slate-500">Opcional</span>
              </div>
              <Select
                value={bulkNoCommission}
                onValueChange={(val: 'keep' | 'yes' | 'no') => setBulkNoCommission(val)}
              >
                <SelectTrigger id="bulk_nocomm" className="h-10 bg-white border-slate-300 text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep" className="text-xs">
                    Não alterar (manter status atual de cada cliente)
                  </SelectItem>
                  <SelectItem value="no" className="text-xs">
                    Ativar Comissão (clientes voltam a gerar comissões)
                  </SelectItem>
                  <SelectItem value="yes" className="text-xs">
                    Dispensar de Comissão (Sem comissão para nenhum mês)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {selectedCustomerIds.length} cliente(s) serão afetados.
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkModalOpen(false)}
                disabled={bulkSaving}
                className="h-9 text-xs border-slate-300"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handlePreSubmitBulkUpdate}
                disabled={
                  bulkSaving ||
                  (bulkNoCommission === 'keep' &&
                    bulkSelectedUserIds.length === 0 &&
                    !bulkReplaceUsers)
                }
                className="h-9 text-xs font-semibold bg-[#0F766E] hover:bg-[#115E59] text-white gap-2 shadow-xs"
              >
                {bulkSaving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando alterações...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Confirmar e Aplicar</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: TRAVA DE CONFIRMAÇÃO PARA CLIENTES "SEM COMISSÃO" */}
      <AlertDialog open={confirmSafetyOpen} onOpenChange={setConfirmSafetyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Confirmação de Segurança
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-700 pt-2 leading-relaxed">
              Atenção! Você selecionou {noCommCustomersCount} cliente(s) que atualmente estão
              marcados como 'Sem Comissão'. Tem a certeza de que deseja ativar a comissão e aplicar
              os novos vínculos para eles?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkSaving}
              onClick={() => {
                setConfirmSafetyOpen(false)
                executeBulkUpdate()
              }}
              className="bg-[#0F766E] hover:bg-[#115E59] text-white"
            >
              Sim, continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
