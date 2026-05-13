/**
 * MesePicker — picker custom per scegliere mese + anno.
 *
 * Dropdown PORTALIZZATO sul body con position:fixed così non viene mai
 * tagliato dai contenitori "overflow:hidden/auto" (problema reale dentro
 * i Dialog, dove la lista veniva clipata e non risultava cliccabile).
 *
 * Uso:
 *   <MesePicker
 *     label="Mese di gettonamento"
 *     value="2026-07"            // 'YYYY-MM' o ''/null
 *     onChange={v => setM(v)}
 *     required
 *   />
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const MESI_IT = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
]

export default function MesePicker({
  label,
  value,
  onChange,
  required = false,
  hint,
  error,
  yearsBack = 2,
  yearsForward = 3,
}) {
  const [yStr, mStr] = (value || '').split('-')
  const year = yStr ? Number(yStr) : null
  const month = mStr ? Number(mStr) : null

  const oggi = new Date()
  const annoOggi = oggi.getFullYear()
  const anni = []
  for (let y = annoOggi - yearsBack; y <= annoOggi + yearsForward; y++) anni.push(y)

  function aggiorna(nuovoMese, nuovoAnno) {
    if (!nuovoMese || !nuovoAnno) {
      onChange?.('')
      return
    }
    const mm = String(nuovoMese).padStart(2, '0')
    onChange?.(`${nuovoAnno}-${mm}`)
  }

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {label}{required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <DropdownPick
          placeholder="— Mese —"
          value={month}
          display={month ? MESI_IT[month - 1] : ''}
          options={MESI_IT.map((nome, i) => ({ v: i + 1, l: nome }))}
          onChange={v => aggiorna(v, year)}
          error={!!error}
        />
        <DropdownPick
          placeholder="— Anno —"
          value={year}
          display={year ? String(year) : ''}
          options={anni.map(y => ({ v: y, l: String(y) }))}
          onChange={v => aggiorna(month, v)}
          error={!!error}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

function DropdownPick({ placeholder, value, display, options, onChange, error }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)   // {top, left, width}
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  // Calcola posizione del menu rispetto al trigger
  function aggiornaPos() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    // Se non c'è abbastanza spazio sotto, apre verso l'alto
    const altezzaStimata = Math.min(options.length * 36 + 8, 240)
    const apriSopra = r.bottom + altezzaStimata > window.innerHeight - 16
    setPos({
      top: apriSopra ? r.top - altezzaStimata - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
    })
  }

  // Chiusura su click esterno / ESC + ricalcola posizione su scroll/resize
  useEffect(() => {
    if (!open) return
    aggiornaPos()
    function onMouseDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onScroll() { aggiornaPos() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border bg-bg px-3 py-2 text-left text-sm transition',
          open ? 'border-accent' : error ? 'border-danger' : 'border-border hover:border-accent/40',
          display ? 'text-white' : 'text-text-muted',
        )}
      >
        <span>{display || placeholder}</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      {open && pos && createPortal(
        <ul
          ref={listRef}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            width: `${pos.width}px`,
            zIndex: 9999,
          }}
          className="max-h-60 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-soft"
        >
          {options.map(o => {
            const sel = o.v === value
            return (
              <li key={o.v}>
                <button
                  type="button"
                  // preventDefault su mousedown evita che il trigger perda il focus
                  // e impedisce conflitti con altri listener globali
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                  onClick={e => {
                    e.stopPropagation()
                    onChange?.(o.v)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition',
                    sel ? 'bg-accent/15 text-white' : 'text-white hover:bg-white/5',
                  )}
                >
                  {o.l}
                  {sel && <span className="text-xs text-accent-2">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>,
        document.body
      )}
    </div>
  )
}
