// PREVIEW ONLY: Client-side syntax validator and preview for tax formulas in Settings.
// ATTENTION: All actual financial calculations and commission deductions MUST occur
// exclusively on the backend (Edge Function calculate-commissions). This helper is NEVER
// to be used for financial accounting or commission record persistence.
// CLIENT_BILLING: gross billing of this customer (preview example)
// GLOBAL_BILLING: company gross billing for the month (preview example)
// Supported operations: +, -, *, /, (, ), decimals

export function evaluateTaxFormula(
  expression: string,
  variables: { CLIENT_BILLING: number; GLOBAL_BILLING: number },
): { result: number; error?: string } {
  try {
    if (!expression || typeof expression !== 'string') {
      return { result: 0, error: 'Expressão vazia' }
    }

    let sanitized = expression.trim()

    // Replace variables with numeric values safely
    sanitized = sanitized.replace(/\bCLIENT_BILLING\b/g, `(${variables.CLIENT_BILLING})`)
    sanitized = sanitized.replace(/\bGLOBAL_BILLING\b/g, `(${variables.GLOBAL_BILLING})`)

    // Only allow digits, arithmetic operators, parentheses, dots, spaces
    if (!/^[\d+\-*/.()\s]+$/.test(sanitized)) {
      return {
        result: 0,
        error:
          'A expressão contém caracteres não permitidos. Apenas números, operadores (+, -, *, /) e parênteses são aceitos.',
      }
    }

    // Evaluate using Function constructor in sandboxed context (no access to window or globals)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(`return (${sanitized});`)
    const val = fn()

    const num = Number(val)
    if (isNaN(num) || !isFinite(num)) {
      return { result: 0, error: 'Resultado da fórmula não é um número válido' }
    }

    return { result: Math.round(num * 100) / 100 }
  } catch (err: any) {
    return { result: 0, error: err?.message || 'Erro ao avaliar expressão' }
  }
}
