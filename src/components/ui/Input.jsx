/**
 * Input con label + messaggio errore integrato.
 * Coerente con §0: bg scuro, border sottile, focus accent.
 *
 * Uso con react-hook-form:
 *   <Input label="Nome" {...register('nome')} error={errors.nome?.message} />
 */
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Input = forwardRef(function Input(
  { label, error, hint, className, ...props },
  ref
) {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="mb-1.5 text-xs font-medium text-text-muted">
          {label}
          {props.required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-xl border bg-bg px-3 py-2 text-sm text-white placeholder:text-text-muted/60',
          'outline-none transition focus:border-accent',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  )
})

export default Input
