import { z } from 'zod'

/**
 * Requisitos de segurança para criação de senhas fortes:
 * - Mínimo de 8 caracteres
 * - Letra maiúscula (A-Z)
 * - Letra minúscula (a-z)
 * - Número (0-9)
 * - Símbolo / caractere especial (!@#$%^&*...)
 */
export interface PasswordRule {
  id: string
  label: string
  test: (val: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: 'No mínimo 8 caracteres',
    test: (val) => val.length >= 8,
  },
  {
    id: 'uppercase',
    label: 'Pelo menos uma letra maiúscula (A-Z)',
    test: (val) => /[A-Z]/.test(val),
  },
  {
    id: 'lowercase',
    label: 'Pelo menos uma letra minúscula (a-z)',
    test: (val) => /[a-z]/.test(val),
  },
  {
    id: 'number',
    label: 'Pelo menos um número (0-9)',
    test: (val) => /[0-9]/.test(val),
  },
  {
    id: 'symbol',
    label: 'Pelo menos um símbolo especial (!@#$%^&*...)',
    test: (val) => /[^A-Za-z0-9]/.test(val),
  },
]

export const strongPasswordSchema = z
  .string()
  .min(8, 'A senha deve conter no mínimo 8 caracteres')
  .regex(/[A-Z]/, 'A senha deve conter ao menos uma letra maiúscula')
  .regex(/[a-z]/, 'A senha deve conter ao menos uma letra minúscula')
  .regex(/[0-9]/, 'A senha deve conter ao menos um número')
  .regex(/[^A-Za-z0-9]/, 'A senha deve conter ao menos um símbolo especial')

export const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail corporativo').email('Formato de e-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve conter no mínimo 2 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'E-mail corporativo é obrigatório')
    .email('Formato de e-mail inválido'),
  password: strongPasswordSchema,
  role: z.enum(['admin', 'manager', 'sales'], {
    errorMap: () => ({ message: 'Selecione um cargo válido' }),
  }),
  fixedSalary: z
    .string()
    .min(1, 'Salário fixo é obrigatório')
    .refine(
      (val) => {
        const num = parseFloat(val.replace(/\./g, '').replace(',', '.'))
        return !isNaN(num) && num >= 0
      },
      { message: 'Informe um valor numérico válido para o salário' },
    ),
})

export type CreateUserFormData = z.infer<typeof createUserSchema>

export const editUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve conter no mínimo 2 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'E-mail corporativo é obrigatório')
    .email('Formato de e-mail inválido'),
  role: z.enum(['admin', 'manager', 'sales'], {
    errorMap: () => ({ message: 'Selecione um cargo válido' }),
  }),
  fixedSalary: z
    .string()
    .min(1, 'Salário fixo é obrigatório')
    .refine(
      (val) => {
        const num = parseFloat(val.replace(/\./g, '').replace(',', '.'))
        return !isNaN(num) && num >= 0
      },
      { message: 'Informe um valor numérico válido para o salário' },
    ),
})

export type EditUserFormData = z.infer<typeof editUserSchema>
