import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  getAllUsers,
  updateUser,
  deleteUser,
  getAllCommissionProfiles,
  upsertCommissionProfile,
  deleteCommissionProfile,
  getAllTaxDeductions,
  upsertTaxDeduction,
  toggleTaxDeductionActive,
  deleteTaxDeduction,
  getSystemSettings,
  updateSystemSettings,
  uploadCompanyLogo,
} from '@/services/commissionService'
import type {
  AppUser,
  CommissionProfile,
  TaxDeduction,
  SystemSettings as SystemSettingsType,
  UserRole,
  CustomerOrigin,
} from '@/types/database'
import { evaluateTaxFormula } from '@/lib/formulaEvaluator'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { UserModal } from '@/components/UserModal'
import {
  Users,
  Percent,
  Receipt,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Info,
  DollarSign,
  Shield,
  Building2,
  UploadCloud,
  Mail,
  Loader2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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

export default function Settings() {
  const { toast } = useToast()
  const { appUser } = useAuth()
  const isAdmin = appUser?.role === 'admin'

  const [users, setUsers] = useState<AppUser[]>([])
  const [profiles, setProfiles] = useState<CommissionProfile[]>([])
  const [taxes, setTaxes] = useState<TaxDeduction[]>([])
  const [systemSettings, setSystemSettings] = useState<SystemSettingsType | null>(null)
  const [loading, setLoading] = useState(true)

  // Company Settings State
  const [companyName, setCompanyName] = useState('Globex Multimodal')
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null)
  const [hrEmail, setHrEmail] = useState('')
  const [financeEmail, setFinanceEmail] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Users Modals & State
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null)

  // Profiles Modals & State
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<CommissionProfile | null>(null)
  const [profileUserId, setProfileUserId] = useState('')
  const [profileType, setProfileType] = useState<CustomerOrigin>('inbound')
  const [profileYear1, setProfileYear1] = useState('3.0')
  const [profileYear2, setProfileYear2] = useState('3.0')
  const [profileSetupFee, setProfileSetupFee] = useState('')
  const [deleteProfileDialogOpen, setDeleteProfileDialogOpen] = useState(false)
  const [profileToDelete, setProfileToDelete] = useState<CommissionProfile | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // Taxes Modals & State
  const [taxModalOpen, setTaxModalOpen] = useState(false)
  const [editingTax, setEditingTax] = useState<TaxDeduction | null>(null)
  const [taxName, setTaxName] = useState('')
  const [taxType, setTaxType] = useState<'percentage' | 'formula'>('percentage')
  const [taxValue, setTaxValue] = useState('2.5')
  const [taxFormula, setTaxFormula] = useState(
    'CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING',
  )
  const [formulaTestResult, setFormulaTestResult] = useState<string | null>(null)
  const [formulaTestError, setFormulaTestError] = useState<string | null>(null)
  const [deleteTaxDialogOpen, setDeleteTaxDialogOpen] = useState(false)
  const [taxToDelete, setTaxToDelete] = useState<TaxDeduction | null>(null)
  const [savingTax, setSavingTax] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersData, profilesData, taxesData, sysSettingsData] = await Promise.all([
        getAllUsers(),
        getAllCommissionProfiles(),
        getAllTaxDeductions(),
        getSystemSettings(),
      ])
      setUsers(usersData)
      setProfiles(profilesData)
      setTaxes(taxesData)
      if (sysSettingsData) {
        setSystemSettings(sysSettingsData)
        setCompanyName(sysSettingsData.company_name || 'Globex Multimodal')
        setCompanyLogoUrl(sysSettingsData.company_logo_url || null)
        setHrEmail(sysSettingsData.hr_email || '')
        setFinanceEmail(sysSettingsData.finance_email || '')
      }
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  // ==========================================
  // COMPANY SETTINGS ACTIONS
  // ==========================================

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isAdmin) {
      toast({
        title: 'Acesso Negado',
        description: 'Apenas administradores podem atualizar a logo da empresa.',
        variant: 'destructive',
      })
      return
    }

    setUploadingLogo(true)
    try {
      const publicUrl = await uploadCompanyLogo(file)
      setCompanyLogoUrl(publicUrl)
      // Save instantly to system settings
      await updateSystemSettings({ company_logo_url: publicUrl })
      toast({
        title: 'Logo Atualizada',
        description: 'A imagem da logo foi enviada e vinculada à empresa.',
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao enviar logo',
        description: err.message || 'Falha ao fazer upload da imagem.',
        variant: 'destructive',
      })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas administradores têm permissão para salvar configurações da empresa.',
        variant: 'destructive',
      })
      return
    }

    setSavingSettings(true)
    try {
      const updated = await updateSystemSettings({
        company_name: companyName.trim() || 'Globex Multimodal',
        company_logo_url: companyLogoUrl,
        hr_email: hrEmail.trim() || null,
        finance_email: financeEmail.trim() || null,
      })
      setSystemSettings(updated)
      toast({
        title: 'Configurações Salvas',
        description: 'Os dados globais da empresa e e-mails foram atualizados.',
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  // ==========================================
  // USERS TAB ACTIONS
  // ==========================================

  const handleOpenUserModal = (u?: AppUser) => {
    setEditingUser(u || null)
    setUserModalOpen(true)
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    try {
      await deleteUser(userToDelete.id)
      toast({
        title: 'Utilizador Removido',
        description: `O utilizador "${userToDelete.name}" foi excluído.`,
      })
      setDeleteUserDialogOpen(false)
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // ==========================================
  // COMMISSION PROFILES TAB ACTIONS
  // ==========================================

  const handleOpenProfileModal = (p?: CommissionProfile) => {
    if (p) {
      setEditingProfile(p)
      setProfileUserId(p.user_id)
      setProfileType(p.type)
      setProfileYear1(String(p.default_percentage_year_1))
      setProfileYear2(String(p.default_percentage_year_2_plus))
      setProfileSetupFee(
        p.setup_fee_percentage !== null && p.setup_fee_percentage !== undefined
          ? String(p.setup_fee_percentage)
          : '',
      )
    } else {
      setEditingProfile(null)
      setProfileUserId(users[0]?.id || '')
      setProfileType('inbound')
      setProfileYear1('3.0')
      setProfileYear2('3.0')
      setProfileSetupFee('')
    }
    setProfileModalOpen(true)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileUserId) {
      toast({
        title: 'Selecione um utilizador',
        description: 'Todo perfil de comissão deve estar associado a um utilizador.',
        variant: 'destructive',
      })
      return
    }

    setSavingProfile(true)
    try {
      const y1 = parseFloat(profileYear1.replace(',', '.')) || 0
      const y2 = parseFloat(profileYear2.replace(',', '.')) || 0
      const setupFeeNum = profileSetupFee.trim()
        ? parseFloat(profileSetupFee.replace(',', '.'))
        : null

      await upsertCommissionProfile({
        id: editingProfile?.id,
        user_id: profileUserId,
        type: profileType,
        default_percentage_year_1: y1,
        default_percentage_year_2_plus: profileType === 'inbound' ? y1 : y2, // Inbound doesn't degrade
        setup_fee_percentage: setupFeeNum !== null && !isNaN(setupFeeNum) ? setupFeeNum : null,
      })

      toast({
        title: 'Perfil Salvo',
        description: `Alíquotas de comissão configuradas com sucesso.`,
      })

      setProfileModalOpen(false)
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar perfil',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!profileToDelete) return
    try {
      await deleteCommissionProfile(profileToDelete.id)
      toast({
        title: 'Perfil Removido',
        description: 'Regra de comissão excluída com sucesso.',
      })
      setDeleteProfileDialogOpen(false)
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir perfil',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // ==========================================
  // TAX DEDUCTIONS TAB ACTIONS
  // ==========================================

  const handleOpenTaxModal = (t?: TaxDeduction) => {
    setFormulaTestResult(null)
    setFormulaTestError(null)

    if (t) {
      setEditingTax(t)
      setTaxName(t.name)
      setTaxType(t.type)
      setTaxValue(String(t.value || '2.5'))
      setTaxFormula(
        t.formula_expression ||
          'CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING',
      )
    } else {
      setEditingTax(null)
      setTaxName('')
      setTaxType('percentage')
      setTaxValue('2.5')
      setTaxFormula('CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING')
    }
    setTaxModalOpen(true)
  }

  const handleTestFormula = () => {
    setFormulaTestResult(null)
    setFormulaTestError(null)

    const testVars = {
      CLIENT_BILLING: 10000,
      GLOBAL_BILLING: 500000,
    }

    const res = evaluateTaxFormula(taxFormula, testVars)
    if (res.error) {
      setFormulaTestError(res.error)
    } else {
      setFormulaTestResult(
        `Com CLIENT_BILLING = R$ 10.000,00 e GLOBAL_BILLING = R$ 500.000,00 → Dedução = ${formatBRL(
          res.result,
        )} (${((res.result / 10000) * 100).toFixed(2)}% do cliente)`,
      )
    }
  }

  const handleSaveTax = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taxName.trim()) {
      toast({
        title: 'Nome Obrigatório',
        description: 'Informe o nome do tributo ou retenção.',
        variant: 'destructive',
      })
      return
    }

    if (taxType === 'formula') {
      const evalCheck = evaluateTaxFormula(taxFormula, {
        CLIENT_BILLING: 10000,
        GLOBAL_BILLING: 500000,
      })
      if (evalCheck.error) {
        toast({
          title: 'Fórmula Inválida',
          description: evalCheck.error,
          variant: 'destructive',
        })
        return
      }
    }

    setSavingTax(true)
    try {
      const valNum = parseFloat(taxValue.replace(',', '.')) || null

      await upsertTaxDeduction({
        id: editingTax?.id,
        name: taxName.trim(),
        type: taxType,
        value: taxType === 'percentage' ? valNum : null,
        formula_expression: taxType === 'formula' ? taxFormula.trim() : null,
        is_active: editingTax ? editingTax.is_active : true,
      })

      toast({
        title: 'Imposto Salvo',
        description: `A dedução "${taxName}" foi gravada com sucesso.`,
      })

      setTaxModalOpen(false)
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar imposto',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingTax(false)
    }
  }

  const handleToggleTaxActive = async (tax: TaxDeduction) => {
    try {
      const nextState = !tax.is_active
      await toggleTaxDeductionActive(tax.id, nextState)
      setTaxes((prev) => prev.map((t) => (t.id === tax.id ? { ...t, is_active: nextState } : t)))
      toast({
        title: nextState ? 'Dedução Ativada' : 'Dedução Desativada',
        description: `"${tax.name}" agora está ${nextState ? 'ativa' : 'inativa'}.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleDeleteTax = async () => {
    if (!taxToDelete) return
    try {
      await deleteTaxDeduction(taxToDelete.id)
      toast({
        title: 'Dedução Excluída',
        description: `O imposto "${taxToDelete.name}" foi removido.`,
      })
      setDeleteTaxDialogOpen(false)
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Configurações do Sistema
        </h2>
        <p className="text-sm text-slate-500">
          Gerencie os colaboradores da equipe comercial, regras de comissão e a matriz de retenção
          de impostos dinâmicos.
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-slate-200/80 p-1 rounded-xl">
          <TabsTrigger
            value="company"
            className="data-[state=active]:bg-white data-[state=active]:text-[#0F766E] font-semibold gap-2"
          >
            <Building2 className="h-4 w-4" />
            <span>Configurações da Empresa</span>
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="data-[state=active]:bg-white data-[state=active]:text-[#0F766E] font-semibold gap-2"
          >
            <Users className="h-4 w-4" />
            <span>Utilizadores ({users.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="profiles"
            className="data-[state=active]:bg-white data-[state=active]:text-[#0F766E] font-semibold gap-2"
          >
            <Percent className="h-4 w-4" />
            <span>Perfis de Comissão ({profiles.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="taxes"
            className="data-[state=active]:bg-white data-[state=active]:text-[#0F766E] font-semibold gap-2"
          >
            <Receipt className="h-4 w-4" />
            <span>Impostos & Fórmulas ({taxes.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* =========================================================================
            TAB 0: CONFIGURAÇÕES DA EMPRESA
           ========================================================================= */}
        <TabsContent value="company" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#0F766E]" />
                    <span>Identidade Corporativa & Notificações Globais</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Defina o nome da empresa, logo oficial usada em relatórios PDF e os e-mails de
                    cópia institucional (RH e Financeiro).
                  </CardDescription>
                </div>
                {!isAdmin && (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-800 border-amber-200 text-xs gap-1"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Modo Leitura (Apenas Admin pode editar)</span>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveCompanySettings} className="space-y-6 max-w-2xl">
                {/* Logo Upload Section */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-slate-700">
                    Logo da Empresa
                  </Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="h-20 w-36 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-2 shadow-xs">
                      {companyLogoUrl ? (
                        <img
                          src={companyLogoUrl}
                          alt="Logo da Empresa"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <Building2 className="h-7 w-7 mx-auto mb-1 opacity-60" />
                          <span className="text-[10px]">Sem logo</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="company-logo-input"
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border shadow-xs cursor-pointer ${
                            isAdmin
                              ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          {uploadingLogo ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Enviando...</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="h-3.5 w-3.5 text-[#0F766E]" />
                              <span>Carregar Nova Logo</span>
                            </>
                          )}
                        </Label>
                        <input
                          id="company-logo-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          disabled={!isAdmin || uploadingLogo}
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        {companyLogoUrl && isAdmin && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCompanyLogoUrl(null)
                              updateSystemSettings({ company_logo_url: null })
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8"
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Formatos aceitos: PNG, JPG, WebP ou SVG (máx. 5MB). Aparecerá no cabeçalho
                        das exportações em PDF.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="company-name"
                    className="text-xs font-semibold uppercase text-slate-700"
                  >
                    Razão Social / Nome da Empresa
                  </Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={!isAdmin || savingSettings}
                    placeholder="Ex: Globex Multimodal"
                    className="h-10"
                  />
                  <p className="text-[11px] text-slate-500">
                    Nome impresso nos relatórios de comissionamento e extratos mensais.
                  </p>
                </div>

                {/* E-mails de Cópia Global */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="hr-email"
                      className="text-xs font-semibold uppercase text-slate-700 flex items-center gap-1.5"
                    >
                      <Mail className="h-3.5 w-3.5 text-teal-600" />
                      <span>E-mail do RH (Recursos Humanos)</span>
                    </Label>
                    <Input
                      id="hr-email"
                      type="email"
                      value={hrEmail}
                      onChange={(e) => setHrEmail(e.target.value)}
                      disabled={!isAdmin || savingSettings}
                      placeholder="rh@empresa.com.br"
                      className="h-10"
                    />
                    <p className="text-[11px] text-slate-500">
                      Recebe cópia do extrato para colaboradores configurados com CC RH.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="finance-email"
                      className="text-xs font-semibold uppercase text-slate-700 flex items-center gap-1.5"
                    >
                      <Mail className="h-3.5 w-3.5 text-teal-600" />
                      <span>E-mail do Financeiro</span>
                    </Label>
                    <Input
                      id="finance-email"
                      type="email"
                      value={financeEmail}
                      onChange={(e) => setFinanceEmail(e.target.value)}
                      disabled={!isAdmin || savingSettings}
                      placeholder="financeiro@empresa.com.br"
                      className="h-10"
                    />
                    <p className="text-[11px] text-slate-500">
                      Recebe cópia para validação de folha e liquidação de comissões.
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={savingSettings || uploadingLogo}
                      className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold h-10 px-5 shadow-sm"
                    >
                      {savingSettings ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Salvando...</span>
                        </div>
                      ) : (
                        'Salvar Configurações da Empresa'
                      )}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 1: UTILIZADORES
           ========================================================================= */}
        <TabsContent value="users" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Colaboradores do Sistema
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Administradores, Gerentes e Executivos de Vendas com seus respectivos salários
                  base
                </CardDescription>
              </div>
              <Button
                onClick={() => handleOpenUserModal()}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold h-9 gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Utilizador</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4">Nome</th>
                      <th className="py-3 px-4">E-mail Corporativo</th>
                      <th className="py-3 px-4">Cargo</th>
                      <th className="py-3 px-4 text-right">Salário Fixo Mensal</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{u.name}</td>
                        <td className="py-3 px-4 text-slate-600">{u.email}</td>
                        <td className="py-3 px-4 capitalize">
                          <Badge
                            variant="outline"
                            className={
                              u.role === 'admin'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                                : u.role === 'manager'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200 font-bold'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                            }
                          >
                            {u.role === 'admin'
                              ? 'Administrador'
                              : u.role === 'manager'
                                ? 'Gerente'
                                : 'Vendedor'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900">
                          {formatBRL(Number(u.fixed_salary))}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenUserModal(u)}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-teal-700 hover:bg-teal-50"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setUserToDelete(u)
                              setDeleteUserDialogOpen(true)
                            }}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 2: PERFIS DE COMISSÃO
           ========================================================================= */}
        <TabsContent value="profiles" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Regras de Alíquotas de Comissões
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Percentuais aplicados sobre a base líquida de acordo com a origem do lead (Inbound
                  vs Outbound) e maturidade do contrato
                </CardDescription>
              </div>
              <Button
                onClick={() => handleOpenProfileModal()}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold h-9 gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Perfil</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4">Colaborador</th>
                      <th className="py-3 px-4">Origem do Cliente</th>
                      <th className="py-3 px-4 text-center">Alíquota 1º Ano (&le; 12 meses)</th>
                      <th className="py-3 px-4 text-center">Alíquota 2º Ano+ (&gt; 12 meses)</th>
                      <th className="py-3 px-4 text-center">Prêmio Implantação (1º Mês)</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profiles.map((p) => {
                      const u = users.find((x) => x.id === p.user_id) || p.user
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {u?.name || 'Utilizador'}
                          </td>
                          <td className="py-3 px-4 capitalize">
                            <span
                              className={`text-xs px-2.5 py-1 rounded font-semibold ${
                                p.type === 'inbound'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                              }`}
                            >
                              {p.type} {p.type === 'inbound' ? '(Vitalício)' : '(Degressivo)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-teal-800 tabular-nums">
                            {p.default_percentage_year_1}%
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-700 tabular-nums">
                            {p.default_percentage_year_2_plus}%
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-amber-700 tabular-nums">
                            {p.setup_fee_percentage !== null &&
                            p.setup_fee_percentage !== undefined ? (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-800 border-amber-300 font-semibold"
                              >
                                {p.setup_fee_percentage}%
                              </Badge>
                            ) : (
                              <span className="text-slate-400 font-normal text-xs">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenProfileModal(p)}
                              className="h-8 w-8 p-0 text-slate-600 hover:text-teal-700 hover:bg-teal-50"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setProfileToDelete(p)
                                setDeleteProfileDialogOpen(true)
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 3: IMPOSTOS & FÓRMULAS
           ========================================================================= */}
        <TabsContent value="taxes" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Matriz de Deduções Tributárias
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Conformidade com a reforma tributária: nenhum imposto hardcoded. Configure
                  alíquotas fixas ou fórmulas matemáticas dinâmicas sobre a receita global.
                </CardDescription>
              </div>
              <Button
                onClick={() => handleOpenTaxModal()}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold h-9 gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Imposto</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4">Nome do Tributo</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Valor ou Expressão Matemática</th>
                      <th className="py-3 px-4 text-center">Ativo</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taxes.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{t.name}</td>
                        <td className="py-3 px-4 capitalize">
                          <Badge
                            variant="outline"
                            className={
                              t.type === 'percentage'
                                ? 'bg-sky-50 text-sky-800 border-sky-200 font-semibold text-xs'
                                : 'bg-purple-50 text-purple-800 border-purple-200 font-semibold text-xs'
                            }
                          >
                            {t.type === 'percentage' ? 'Porcentagem' : 'Fórmula'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {t.type === 'percentage' ? (
                            <span className="font-bold text-slate-800 tabular-nums">
                              {t.value}%
                            </span>
                          ) : (
                            <code className="text-xs bg-slate-100 text-purple-900 px-2 py-1 rounded font-mono break-all max-w-md block">
                              {t.formula_expression}
                            </code>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Switch
                            checked={t.is_active}
                            onCheckedChange={() => handleToggleTaxActive(t)}
                          />
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenTaxModal(t)}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-teal-700 hover:bg-teal-50"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTaxToDelete(t)
                              setDeleteTaxDialogOpen(true)
                            }}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODAL: UTILIZADOR (Refatorado com React Hook Form + Zod + Checklist de Senha)
         ========================================================================= */}
      <UserModal
        open={userModalOpen}
        onOpenChange={setUserModalOpen}
        editingUser={editingUser}
        onSuccess={loadData}
      />

      {/* CONFIRM DELETE USER */}
      <AlertDialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este utilizador?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover{' '}
              <strong className="text-slate-900">{userToDelete?.name}</strong>. Esta ação não poderá
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* =========================================================================
          MODAL: PERFIL DE COMISSÃO
         ========================================================================= */}
      <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveProfile}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editingProfile ? 'Editar Regra de Comissão' : 'Nova Regra de Comissão'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Defina a taxa de comissão aplicada ao vendedor sobre o faturamento líquido.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-user" className="text-xs font-semibold uppercase text-slate-700">
                  Colaborador
                </Label>
                <Select value={profileUserId} onValueChange={(val) => setProfileUserId(val)}>
                  <SelectTrigger id="p-user" className="h-10">
                    <SelectValue placeholder="Selecione o utilizador" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-type" className="text-xs font-semibold uppercase text-slate-700">
                  Origem do Lead / Cliente
                </Label>
                <Select
                  value={profileType}
                  onValueChange={(val: CustomerOrigin) => {
                    setProfileType(val)
                    if (val === 'inbound') {
                      setProfileYear2(profileYear1)
                    }
                  }}
                >
                  <SelectTrigger id="p-type" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound (Lead Receptivo)</SelectItem>
                    <SelectItem value="outbound">Outbound (Prospecção Ativa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-y1" className="text-xs font-semibold uppercase text-slate-700">
                    Alíquota 1º Ano (%)
                  </Label>
                  <Input
                    id="p-y1"
                    type="text"
                    required
                    value={profileYear1}
                    onChange={(e) => {
                      setProfileYear1(e.target.value)
                      if (profileType === 'inbound') {
                        setProfileYear2(e.target.value)
                      }
                    }}
                    className="h-10 tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-y2" className="text-xs font-semibold uppercase text-slate-700">
                    Alíquota 2º Ano+ (%)
                  </Label>
                  <Input
                    id="p-y2"
                    type="text"
                    required
                    disabled={profileType === 'inbound'}
                    value={profileType === 'inbound' ? profileYear1 : profileYear2}
                    onChange={(e) => setProfileYear2(e.target.value)}
                    className="h-10 tabular-nums"
                  />
                </div>
              </div>

              {/* Campo opcional: Setup fee (Prêmio de Implantação) */}
              <div className="space-y-1.5 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="p-setup"
                    className="text-xs font-bold text-amber-950 uppercase flex items-center gap-1.5"
                  >
                    <span>Comissão de Implantação (Setup Fee %)</span>
                  </Label>
                  <span className="text-[10px] text-amber-800 font-medium">Opcional</span>
                </div>
                <div className="relative">
                  <Input
                    id="p-setup"
                    type="text"
                    value={profileSetupFee}
                    onChange={(e) => setProfileSetupFee(e.target.value)}
                    placeholder="Ex: 10.0 (opcional)"
                    className="h-10 pr-8 bg-white border-amber-300 tabular-nums focus-visible:ring-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-sm font-bold text-amber-700">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Taxa diferenciada aplicada <strong>apenas no 1º faturamento do cliente</strong>{' '}
                  (quando o mês de faturamento coincide com o mês da data de início do cliente). Se
                  deixar em branco, aplicará a taxa padrão de 1º ano.
                </p>
              </div>

              {profileType === 'inbound' ? (
                <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Dica de Negócio:</strong> Inbound normalmente não degrada com o tempo —
                    mantemos os dois valores iguais (alíquota vitalícia).
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Regra Outbound:</strong> Remuneração acelerada no 1º ano (&le; 12 meses
                    de contrato) e alíquota de sustentação a partir do 2º ano (&gt; 12 meses).
                  </span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingProfile}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold"
              >
                {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE PROFILE */}
      <AlertDialog open={deleteProfileDialogOpen} onOpenChange={setDeleteProfileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta regra de comissão?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão fará com que este vendedor não receba alíquota correspondente a esta origem
              de clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProfile}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* =========================================================================
          MODAL: IMPOSTO / DEDUÇÃO TRIBUTÁRIA
         ========================================================================= */}
      <Dialog open={taxModalOpen} onOpenChange={setTaxModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSaveTax}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editingTax ? 'Editar Retenção Fiscal' : 'Nova Dedução Fiscal'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastre percentuais simples ou fórmulas matemáticas dinâmicas de dedução fiscal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-name" className="text-xs font-semibold uppercase text-slate-700">
                  Nome do Tributo ou Retenção
                </Label>
                <Input
                  id="t-name"
                  required
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  placeholder="Ex: ISS, PIS/COFINS, IRPJ Reforma"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-700">
                  Modelo de Cálculo da Dedução
                </Label>
                <RadioGroup
                  value={taxType}
                  onValueChange={(val: 'percentage' | 'formula') => setTaxType(val)}
                  className="grid grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="r-percentage"
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                      taxType === 'percentage'
                        ? 'border-[#0F766E] bg-teal-50/50'
                        : 'border-slate-200'
                    }`}
                  >
                    <RadioGroupItem value="percentage" id="r-percentage" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Porcentagem Simples</p>
                      <p className="text-[11px] text-slate-500">Ex: 2.5% ou 5%</p>
                    </div>
                  </label>

                  <label
                    htmlFor="r-formula"
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                      taxType === 'formula' ? 'border-[#0F766E] bg-teal-50/50' : 'border-slate-200'
                    }`}
                  >
                    <RadioGroupItem value="formula" id="r-formula" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Fórmula Matemática</p>
                      <p className="text-[11px] text-slate-500">Dinâmica global</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {taxType === 'percentage' ? (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="t-value"
                    className="text-xs font-semibold uppercase text-slate-700"
                  >
                    Alíquota Percentual (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="t-value"
                      type="text"
                      required
                      value={taxValue}
                      onChange={(e) => setTaxValue(e.target.value)}
                      placeholder="2.5"
                      className="h-10 pr-8 tabular-nums"
                    />
                    <span className="absolute right-3 top-2.5 text-sm font-bold text-slate-400">
                      %
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="t-formula"
                      className="text-xs font-semibold uppercase text-slate-700"
                    >
                      Expressão Matemática da Fórmula
                    </Label>
                    <Textarea
                      id="t-formula"
                      rows={3}
                      required
                      value={taxFormula}
                      onChange={(e) => setTaxFormula(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING"
                    />
                  </div>

                  {/* Legend Box of Accepted Variables */}
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Variáveis Dinâmicas Disponíveis:
                    </span>
                    <ul className="space-y-1 text-slate-600">
                      <li>
                        <code className="bg-slate-200 px-1 py-0.5 rounded text-teal-800 font-bold">
                          CLIENT_BILLING
                        </code>{' '}
                        &mdash; Faturamento bruto daquele cliente
                      </li>
                      <li>
                        <code className="bg-slate-200 px-1 py-0.5 rounded text-teal-800 font-bold">
                          GLOBAL_BILLING
                        </code>{' '}
                        &mdash; Faturamento bruto total da empresa no mês
                      </li>
                    </ul>
                    <p className="text-[11px] text-slate-500 pt-1">
                      Exemplo funcional:{' '}
                      <code className="text-purple-700 font-mono text-[10px]">
                        CLIENT_BILLING * (((GLOBAL_BILLING * 0.32) - 20000) * 0.1) / GLOBAL_BILLING
                      </code>
                    </p>
                  </div>

                  {/* Test Formula button */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestFormula}
                      className="text-xs border-teal-600 text-teal-700 hover:bg-teal-50 gap-1.5"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      <span>Testar Fórmula (Simular)</span>
                    </Button>
                  </div>

                  {formulaTestResult && (
                    <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{formulaTestResult}</span>
                    </div>
                  )}

                  {formulaTestError && (
                    <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>{formulaTestError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTaxModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingTax}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold"
              >
                {savingTax ? 'Gravando...' : 'Salvar Imposto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE TAX */}
      <AlertDialog open={deleteTaxDialogOpen} onOpenChange={setDeleteTaxDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta dedução fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está removendo <strong className="text-slate-900">{taxToDelete?.name}</strong>.
              Fechamentos futuros não incluirão mais este tributo na dedução.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTax}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
