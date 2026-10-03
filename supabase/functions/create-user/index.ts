import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateUserPayload {
  email: string
  password?: string
  name: string
  role: 'admin' | 'manager' | 'sales'
  fixed_salary?: number
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

    // Client administrativo com service_role para checar privilégios e criar usuário
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
          error: 'Acesso negado. Apenas Administradores podem cadastrar utilizadores.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // 2. Extrair dados da requisição
    const body: CreateUserPayload = await req.json()
    const { email, password, name, role, fixed_salary } = body

    if (!email || !name || !role) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: email, name e role.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()
    const cleanSalary = typeof fixed_salary === 'number' ? fixed_salary : 0

    let createdAuthUserId: string | null = null

    if (password && password.length >= 6) {
      // Criação direta com senha definida pelo Admin
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

    // 3. Inserir ou atualizar na tabela pública `users`
    const { data: profileData, error: insertProfileError } = await adminClient
      .from('users')
      .upsert({
        id: createdAuthUserId,
        name: cleanName,
        email: cleanEmail,
        role: role,
        fixed_salary: cleanSalary,
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
