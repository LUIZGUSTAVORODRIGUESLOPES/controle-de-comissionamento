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

/**
 * Gera uma senha aleatória que satisfaz com certeza todas as regras do strongPasswordSchema.
 * Comprimento padrão: 12 caracteres.
 */
export function generateStrongPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I e O para evitar confusão visual
  const lower = 'abcdefghijkmnpqrstuvwxyz' // sem l e o
  const numbers = '23456789' // sem 0 e 1
  const symbols = '!@#$%&*+=?'

  const allChars = upper + lower + numbers + symbols

  // Garante ao menos um caractere de cada categoria
  const getRandom = (str: string) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      return str[arr[0] % str.length]
    }
    return str[Math.floor(Math.random() * str.length)]
  }

  const passwordChars = [getRandom(upper), getRandom(lower), getRandom(numbers), getRandom(symbols)]

  // Completa até o comprimento desejado
  while (passwordChars.length < Math.max(8, length)) {
    passwordChars.push(getRandom(allChars))
  }

  // Embaralha com Fisher-Yates
  for (let i = passwordChars.length - 1; i > 0; i--) {
    let j: number
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      j = arr[0] % (i + 1)
    } else {
      j = Math.floor(Math.random() * (i + 1))
    }
    const temp = passwordChars[i]
    passwordChars[i] = passwordChars[j]
    passwordChars[j] = temp
  }

  return passwordChars.join('')
}

export const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail corporativo').email('Formato de e-mail inválido'),
  password: z
    .string()
    .min(1, 'Informe sua senha')
    .min(6, 'A senha deve conter no mínimo 6 caracteres'),
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
    message: 'Selecione um cargo válido',
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
  autoSendReportToSelf: z.boolean(),
  ccHr: z.boolean(),
  ccFinance: z.boolean(),
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
    message: 'Selecione um cargo válido',
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
  autoSendReportToSelf: z.boolean(),
  ccHr: z.boolean(),
  ccFinance: z.boolean(),
})

export type EditUserFormData = z.infer<typeof editUserSchema>

export const resetPasswordSchema = z
  .object({
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As palavras-passe não coincidem',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'A nova senha deve ser diferente da senha atual',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'A confirmação de senha não coincide',
    path: ['confirmPassword'],
  })

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>
