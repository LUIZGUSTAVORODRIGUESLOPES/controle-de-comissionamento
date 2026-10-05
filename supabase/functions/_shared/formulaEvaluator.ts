import * as math from 'npm:mathjs@^14.0.1'

export interface FormulaVariables {
  CLIENT_BILLING: number
  GLOBAL_BILLING: number
}

export interface FormulaEvaluationResult {
  result: number
  error?: string
}

/**
 * Backend-safe math formula evaluation for dynamic tax deductions using mathjs.
 * Supported variables:
 * - CLIENT_BILLING: gross billing of this customer/billing
 * - GLOBAL_BILLING: company gross billing for the month
 */
export function evaluateTaxFormula(
  expression: string | null | undefined,
  variables: FormulaVariables,
): FormulaEvaluationResult {
  try {
    if (!expression || typeof expression !== 'string' || !expression.trim()) {
      return { result: 0, error: 'Expressão vazia' }
    }

    const trimmed = expression.trim()

    // Compile expression with mathjs
    const compiled = math.compile(trimmed)
    const evaluated = compiled.evaluate({
      CLIENT_BILLING: Number(variables.CLIENT_BILLING) || 0,
      GLOBAL_BILLING: Number(variables.GLOBAL_BILLING) || 0,
    })

    const num = Number(evaluated)
    if (isNaN(num) || !isFinite(num)) {
      return { result: 0, error: 'Resultado da fórmula não é um número válido' }
    }

    // Round to 2 decimal places for financial currency accuracy
    return { result: Math.round(num * 100) / 100 }
  } catch (err: any) {
    return { result: 0, error: err?.message || 'Erro ao avaliar expressão matemática' }
  }
}
