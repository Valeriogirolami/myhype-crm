/**
 * Select nativo stilato — più semplice di un dropdown custom,
 * ma con aspetto coerente con Input.
 *
 * Uso:
 *   <Select label="Categoria" {...register('categoria')}>
 *     <option value="A">A</option>
 *     <option value="B">B</option>
 *   </Select>
 */
import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = forwardRef(function Select(
  { label, error, hint, children, className, ...props },
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
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-xl border bg-bg px-3 py-2 pr-9 text-sm text-white',
            'outline-none transition focus:border-accent',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            error ? 'border-danger' : 'border-border',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  )
})

export default Select
