import { Check, X } from 'lucide-react'
import { PASSWORD_RULES } from '@/lib/auth-schemas'
import { cn } from '@/lib/utils'

interface PasswordStrengthChecklistProps {
  password: string
  className?: string
  title?: string
}

export function PasswordStrengthChecklist({
  password,
  className,
  title = 'Requisitos de segurança da senha:',
}: PasswordStrengthChecklistProps) {
  const checks = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password || ''),
  }))

  const passedCount = checks.filter((c) => c.passed).length
  const total = checks.length
  const isComplete = passedCount === total

  // Medidor visual de força
  const strengthColor =
    passedCount === 0
      ? 'bg-slate-200'
      : passedCount <= 2
        ? 'bg-rose-500'
        : passedCount <= 4
          ? 'bg-amber-500'
          : 'bg-emerald-500'

  const strengthLabel =
    passedCount === 0
      ? 'Não informada'
      : passedCount <= 2
        ? 'Muito fraca'
        : passedCount <= 4
          ? 'Moderada'
          : 'Forte & Segura'

  return (
    <div
      className={cn(
        'p-3 rounded-lg border bg-slate-50/70 border-slate-200 text-xs space-y-2.5 transition-all',
        isComplete && 'border-emerald-200 bg-emerald-50/40',
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">{title}</span>
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded',
            passedCount <= 2 && 'text-rose-700 bg-rose-100',
            passedCount > 2 && passedCount < 5 && 'text-amber-700 bg-amber-100',
            isComplete && 'text-emerald-700 bg-emerald-100',
          )}
        >
          {strengthLabel} ({passedCount}/{total})
        </span>
      </div>

      {/* Barra de progresso */}
      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={cn(
              'h-full flex-1 transition-all duration-200',
              step <= passedCount ? strengthColor : 'bg-slate-200',
            )}
          />
        ))}
      </div>

      {/* Lista de regras com ícones de status em tempo real */}
      <ul className="space-y-1.5 pt-1">
        {checks.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-2 text-[11px] transition-colors',
              rule.passed ? 'text-emerald-700 font-medium' : 'text-slate-500',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors',
                rule.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400',
              )}
            >
              {rule.passed ? (
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              ) : (
                <X className="h-2.5 w-2.5 stroke-[2]" />
              )}
            </span>
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
