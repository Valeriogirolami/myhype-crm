/**
 * DatePicker — input data con mini calendario popup custom.
 *
 * Sostituisce <input type="date"> dove il widget nativo è poco visibile su Mac.
 * Click sul bottone → si apre un popover con un calendario classico (matrice
 * 7×6 di giorni). Settimana lun-dom (formato italiano).
 *
 * Uso:
 *   <DatePicker
 *     value="2026-04-29"        // ISO YYYY-MM-DD ('' / null se vuoto)
 *     onChange={v => setData(v)}
 *     placeholder="da..."
 *   />
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MESI_IT = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
]
const GIORNI_SETTIMANA = ['Lu','Ma','Me','Gi','Ve','Sa','Do']

export default function DatePicker({ value, onChange, placeholder = 'Seleziona data', minDate, maxDate, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Mese/anno mostrato nel calendario
  const oggi = new Date()
  const initialView = parseISO(value) || new Date()
  const [viewYear, setViewYear] = useState(initialView.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialView.getMonth()) // 0-11

  useEffect(() => {
    // Quando si apre il picker, sincronizzo la vista col valore
    if (!open) return
    const d = parseISO(value)
    if (d) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [open, value])

  // Chiusura su click esterno / ESC
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Calcolo la matrice del calendario
  const calendario = useMemo(() => {
    const primoDelMese = new Date(viewYear, viewMonth, 1)
    // Lunedì come primo giorno della settimana (italiano)
    const dayOfWeek = (primoDelMese.getDay() + 6) % 7  // 0=lu, 1=ma, ..., 6=do
    const giorniNelMese = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells = []
    // Vuoti iniziali
    for (let i = 0; i < dayOfWeek; i++) cells.push(null)
    // Giorni effettivi
    for (let g = 1; g <= giorniNelMese; g++) cells.push(g)
    // Riempi fino a multipli di 7
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewYear, viewMonth])

  function nextMese() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  function prevMese() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function selezionaGiorno(g) {
    if (!g) return
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(g).padStart(2, '0')
    const iso = `${viewYear}-${mm}-${dd}`
    if (minDate && iso < minDate) return
    if (maxDate && iso > maxDate) return
    onChange?.(iso)
    setOpen(false)
  }

  function pulisci(e) {
    e.stopPropagation()
    onChange?.('')
  }

  const dValue = parseISO(value)
  const display = dValue ? formatItalian(dValue) : ''

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-bg px-2.5 py-1.5 text-sm transition',
          open ? 'border-accent' : 'border-border hover:border-accent/40',
          display ? 'text-white' : 'text-text-muted',
        )}
      >
        <Calendar size={14} className="text-text-muted" />
        <span className="tabular-nums">{display || placeholder}</span>
        {display && (
          <span
            onClick={pulisci}
            role="button"
            tabIndex={-1}
            className="ml-1 rounded-full p-0.5 text-text-muted hover:bg-white/10 hover:text-danger"
            title="Rimuovi"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-border bg-surface p-3 shadow-soft">
          {/* Header con navigazione */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMese}
              className="rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-white"
              title="Mese precedente"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-sm font-medium text-white">
              {MESI_IT[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={nextMese}
              className="rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-white"
              title="Mese successivo"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Giorni della settimana */}
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {GIORNI_SETTIMANA.map(g => (
              <div key={g} className="text-center text-[10px] uppercase tracking-wide text-text-muted">{g}</div>
            ))}
          </div>

          {/* Griglia giorni */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendario.map((g, i) => {
              if (!g) return <div key={i} />
              const mm = String(viewMonth + 1).padStart(2, '0')
              const dd = String(g).padStart(2, '0')
              const iso = `${viewYear}-${mm}-${dd}`
              const isToday = sameYMD(new Date(iso), oggi)
              const isSelected = sameYMD(new Date(iso), dValue)
              const disabled = (minDate && iso < minDate) || (maxDate && iso > maxDate)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => selezionaGiorno(g)}
                  className={cn(
                    'h-8 w-full rounded-lg text-sm tabular-nums transition',
                    disabled
                      ? 'text-text-muted/30 cursor-not-allowed'
                      : isSelected
                        ? 'bg-gradient-primary text-white font-semibold'
                        : isToday
                          ? 'border border-accent/40 text-accent-2 hover:bg-accent/10'
                          : 'text-white hover:bg-white/5'
                  )}
                >
                  {g}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
            <button
              type="button"
              onClick={() => {
                const t = new Date()
                setViewYear(t.getFullYear())
                setViewMonth(t.getMonth())
              }}
              className="rounded-lg px-2 py-1 hover:bg-white/5 hover:text-white"
            >
              Oggi
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange?.(''); setOpen(false) }}
                className="rounded-lg px-2 py-1 hover:bg-white/5 hover:text-danger"
              >
                Cancella
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// --- helpers ---

function parseISO(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function sameYMD(a, b) {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
}

function formatItalian(d) {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
