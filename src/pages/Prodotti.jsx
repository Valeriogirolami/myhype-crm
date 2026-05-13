/**
 * Pagina Prodotti (§5).
 *
 * Layout come da §5.5:
 * - 3 card in testa (Mobile / Fisso / Energia), sempre visibili
 * - Sotto ogni card, la lista dei sottoprodotti di quel prodotto
 * - Bottone "+ Nuovo sottoprodotto" per ogni prodotto (preselezione padre)
 * - Click sulla riga → dialog di modifica
 *
 * Visibilità colonna Fatturato Azienda:
 *  - Solo Admin (§11). Per BO la nascondiamo.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Loader2, Smartphone, Phone, Zap, Package, EyeOff,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { formatEuro, formatInt, cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SottoprodottoDialog from './SottoprodottoDialog'

// Anagrafica visuale dei 3 prodotti (§5.1 — fissi)
const prodotti = [
  {
    key:   'mobile',
    label: 'Mobile',
    desc:  'Offerte di telefonia mobile TIM',
    icon:  Smartphone,
    tone:  'accent',
  },
  {
    key:   'fisso',
    label: 'Fisso',
    desc:  'Offerte di telefonia fissa TIM',
    icon:  Phone,
    tone:  'info',
  },
  {
    key:   'energia',
    label: 'Energia',
    desc:  'Offerte energia e gas',
    icon:  Zap,
    tone:  'warning',
  },
]

export default function Prodotti() {
  const { profile } = useAuth()
  const isAdmin = profile?.ruolo === 'admin'
  const canEdit = ['admin', 'bo'].includes(profile?.ruolo)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const [dlgOpen, setDlgOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [preset, setPreset] = useState(null)  // prodotto_padre pre-selezionato

  async function fetchSottoprodotti() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sottoprodotti')
      .select('*')
      .order('prodotto_padre', { ascending: true })
      .order('nome', { ascending: true })
    if (error) {
      toast.error(`Errore caricamento: ${error.message}`)
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSottoprodotti()
  }, [])

  // Raggruppo i sottoprodotti per prodotto padre
  const byPadre = useMemo(() => {
    const out = { mobile: [], fisso: [], energia: [] }
    for (const r of rows) {
      if (out[r.prodotto_padre]) out[r.prodotto_padre].push(r)
    }
    return out
  }, [rows])

  function openCreate(prodottoPadre) {
    setSelected(null)
    setPreset(prodottoPadre)
    setDlgOpen(true)
  }

  function openEdit(sp) {
    if (!canEdit) return
    setSelected(sp)
    setPreset(sp.prodotto_padre)
    setDlgOpen(true)
  }

  return (
    <div>
      {/* Header pagina */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Prodotti</h1>
          <p className="mt-1 text-text-muted">
            I 3 prodotti sono fissi. I sottoprodotti sono configurabili dagli Admin/BO.
          </p>
        </div>
      </div>

      {/* 3 sezioni prodotto */}
      <div className="mt-8 space-y-6">
        {prodotti.map(p => (
          <ProdottoSection
            key={p.key}
            prodotto={p}
            items={byPadre[p.key] || []}
            loading={loading}
            isAdmin={isAdmin}
            canEdit={canEdit}
            onCreate={() => openCreate(p.key)}
            onEditRow={openEdit}
          />
        ))}
      </div>

      {/* Dialog CRUD */}
      <SottoprodottoDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        sottoprodotto={selected}
        prodottoPadrePreset={preset}
        onSaved={fetchSottoprodotti}
      />
    </div>
  )
}

// ---------- sub-componenti ----------

function ProdottoSection({ prodotto, items, loading, isAdmin, canEdit, onCreate, onEditRow }) {
  const Icon = prodotto.icon
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      {/* Header sezione */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl',
            prodotto.tone === 'accent'  && 'bg-accent/10 text-accent-2',
            prodotto.tone === 'info'    && 'bg-info/10 text-info',
            prodotto.tone === 'warning' && 'bg-warning/10 text-warning',
          )}>
            <Icon size={20} />
          </div>
          <div>
            <div className="text-lg font-medium text-white">{prodotto.label}</div>
            <div className="text-xs text-text-muted">{prodotto.desc}</div>
          </div>
          <Badge tone={prodotto.tone} className="ml-2">
            {items.length} {items.length === 1 ? 'sottoprodotto' : 'sottoprodotti'}
          </Badge>
        </div>

        {canEdit && (
          <Button variant="secondary" size="sm" onClick={onCreate}>
            <Plus size={14} />
            Nuovo sottoprodotto
          </Button>
        )}
      </div>

      {/* Corpo — tabella sottoprodotti */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
          <Loader2 size={16} className="animate-spin" />
          Caricamento…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-text-muted">
            <Package size={18} />
          </div>
          <p className="text-sm text-white">Nessun sottoprodotto ancora</p>
          {canEdit && (
            <button
              onClick={onCreate}
              className="text-xs text-accent-2 hover:underline"
            >
              + Crea il primo per {prodotto.label}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-6 py-3 font-medium">Nome</th>
                {isAdmin && (
                  <th className="px-6 py-3 font-medium">Fatt. Azienda</th>
                )}
                <th className="px-6 py-3 font-medium">Fatt. PdV</th>
                <th className="px-6 py-3 font-medium">Punti</th>
                <th className="px-6 py-3 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {items.map(sp => (
                <tr
                  key={sp.id}
                  onClick={() => onEditRow(sp)}
                  className={cn(
                    'border-t border-border transition-colors',
                    canEdit ? 'cursor-pointer hover:bg-white/5' : '',
                    sp.stato === 'disattivato' && 'opacity-60',
                  )}
                >
                  <td className="px-6 py-3 font-medium text-white">
                    <div className="flex items-center gap-2">
                      {sp.nome}
                      {sp.tipo_energia === 'luce' && (
                        <Badge tone="warning" className="text-[10px]">⚡ Luce</Badge>
                      )}
                      {sp.tipo_energia === 'gas' && (
                        <Badge tone="info" className="text-[10px]">🔥 Gas</Badge>
                      )}
                      {sp.prodotto_padre === 'energia' && !sp.tipo_energia && (
                        <Badge tone="danger" className="text-[10px]" title="Tipo non impostato">
                          ⚠ Manca tipo
                        </Badge>
                      )}
                      {sp.stato === 'disattivato' && (
                        <EyeOff size={12} className="text-text-muted" />
                      )}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3 text-white tabular-nums">
                      {formatEuro(sp.fatturato_azienda)}
                    </td>
                  )}
                  <td className="px-6 py-3 text-white tabular-nums">
                    {formatEuro(sp.fatturato_pdv)}
                  </td>
                  <td className="px-6 py-3 text-white tabular-nums">
                    {formatInt(sp.punti)}
                  </td>
                  <td className="px-6 py-3">
                    <Badge tone={sp.stato === 'attivo' ? 'success' : 'neutral'}>
                      {sp.stato === 'attivo' ? 'Attivo' : 'Disattivato'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
