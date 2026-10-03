import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface RequestPayload {
  action?: 'create' | 'reset-password'
  // Create payload
  email?: string
  password?: string
  name?: string
  role?: 'admin' | 'manager' | 'sales'
  fixed_salary?: number
  auto_send_report_to_self?: boolean
  cc_hr?: boolean
  cc_finance?: boolean
  must_change_password?: boolean

  // Reset password payload
  user_id?: string
  new_password?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta (service role)' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 1. Validar JWT do chamador para garantir que é um usuário autenticado com perfil admin
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Autorização necessária. Cabeçalho ausente.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Client de verificação com a anon key e JWT do chamador
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user: callerUser },
      error: callerError,
    } = await authClient.auth.getUser()

    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Sessão do chamador inválida ou expirada.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Client administrativo com service_role para checar privilégios e executar ações de admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('users')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || !callerProfile || callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({
          error: 'Acesso negado. Apenas Administradores podem gerenciar senhas e utilizadores.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Extrair dados da requisição
    const body: RequestPayload = await req.json()
    const action = body.action || (body.user_id && body.new_password ? 'reset-password' : 'create')

    // ==========================================
    // AÇÃO 1: RESET DE SENHA POR ADMINISTRADOR
    // ==========================================
    if (action === 'reset-password') {
      const { user_id, new_password, must_change_password } = body

      if (!user_id || !new_password) {
        return new Response(
          JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: user_id e new_password.' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      if (new_password.length < 8) {
        return new Response(
          JSON.stringify({ error: 'A nova palavra-passe deve conter pelo menos 8 caracteres.' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      // Atualiza a senha no Supabase Auth usando a Admin API
      const { data: updatedAuthUser, error: updateAuthErr } =
        await adminClient.auth.admin.updateUserById(user_id, {
          password: new_password,
        })

      if (updateAuthErr) {
        return new Response(JSON.stringify({ error: updateAuthErr.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      // Por padrão, reset por admin também força o usuário a mudar a senha no próximo login (default true)
      const flagMustChange = must_change_password !== undefined ? must_change_password : true

      const { data: updatedProfile, error: profileUpdateErr } = await adminClient
        .from('users')
        .update({ must_change_password: flagMustChange })
        .eq('id', user_id)
        .select()
        .single()

      if (profileUpdateErr) {
        console.warn(
          'Aviso: falha ao atualizar flag must_change_password no perfil:',
          profileUpdateErr,
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          user: updatedProfile || { id: updatedAuthUser.user.id },
          must_change_password: flagMustChange,
          message:
            'Palavra-passe redefinida com sucesso. O utilizador deverá cadastrar uma nova senha no próximo acesso.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // ==========================================
    // AÇÃO 2: CRIAÇÃO DE UTILIZADOR
    // ==========================================
    const {
      email,
      password,
      name,
      role,
      fixed_salary,
      auto_send_report_to_self,
      cc_hr,
      cc_finance,
      must_change_password,
    } = body

    if (!email || !name || !role) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: email, name e role.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()
    const cleanSalary = typeof fixed_salary === 'number' ? fixed_salary : 0
    const forceChange = must_change_password !== undefined ? must_change_password : true

    let createdAuthUserId: string | null = null

    if (password && password.length >= 6) {
      // Criação direta com senha definida (gerada automaticamente pelo admin)
      const { data: createdUser, error: createAuthError } = await adminClient.auth.admin.createUser(
        {
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: { name: cleanName },
        },
      )

      if (createAuthError) {
        return new Response(JSON.stringify({ error: createAuthError.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      createdAuthUserId = createdUser.user.id
    } else {
      // Convite por e-mail via Supabase Auth Admin
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(cleanEmail, {
          data: { name: cleanName },
        })

      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      createdAuthUserId = inviteData.user.id
    }

    // Inserir ou atualizar na tabela pública `users` com a flag must_change_password
    const { data: profileData, error: insertProfileError } = await adminClient
      .from('users')
      .upsert({
        id: createdAuthUserId,
        name: cleanName,
        email: cleanEmail,
        role: role,
        fixed_salary: cleanSalary,
        auto_send_report_to_self: auto_send_report_to_self ?? true,
        cc_hr: cc_hr ?? false,
        cc_finance: cc_finance ?? false,
        must_change_password: forceChange,
      })
      .select()
      .single()

    if (insertProfileError) {
      return new Response(
        JSON.stringify({
          error: `Utilizador de autenticação criado, mas falhou ao gravar perfil público: ${insertProfileError.message}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: profileData,
        message: 'Utilizador cadastrado com sucesso no Supabase Auth e base de dados.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (err: any) {
    console.error('Erro na função create-user:', err)
    return new Response(JSON.stringify({ error: err.message || 'Erro interno no servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
