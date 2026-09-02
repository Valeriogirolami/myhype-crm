/**
 * Dialog Dettaglio + Modifica Cliente.
 *
 * - In sola lettura per la maggior parte dei ruoli
 * - Admin/BO: bottone "Modifica" che sblocca i campi anagrafica
 * - Mostra anche lo storico contratti del cliente
 *
 * Campi (§4.1):
 *   categoria (privato/azienda) — determina visibilità
 *   nome, cognome, ragione_sociale, codice_fiscale, p_iva
 *   email, telefono, telefono_fisso, iban, pod, pdr
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Loader2, Edit3, Save, X, User, FileText, Mail, Phone, CreditCard,
  ChevronRight, ChevronDown, Package,
} from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatDate, formatEuro, formatInt } from '@/lib/utils'
import { STATI, PRODOTTI, calcolaTotali, nomeCliente } from '@/lib/contratti'
import { validaCampiCliente, confermaInserimentoForzato } from '@/lib/validators'

export default function ClienteDialog({ open, onClose, clienteId, onSaved }) {
  const { profile } = useAuth()
  const isBoAdmin = ['admin', 'bo'].includes(profile?.ruolo)
  // HR: sola visualizzazione senza fatturati (2026-07)
  const isHr = profile?.ruolo === 'hr'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState(null)        // dati cliente
  const [contratti, setContratti] = useState([]) // storico contratti
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  async function fetchTutto() {
    if (!clienteId) return
    setLoading(true)
    try {
      const [resCli, resCtr] = await Promise.all([
        supabase.from('clienti').select('*').eq('id', clienteId).single(),
        supabase
          .from('contratti')
          .select(`
            id, prodotto, stato, data_stipula, data_sottoscrizione, mese_gettonamento, mese_storno,
            fatturato_pdv_snap, punti_snap, codice_contratto,
            pdv:pdv(id, nome),
            contratto_sottoprodotti(sottoprodotti(id, nome, punti, fatturato_pdv))
          `)
          .eq('cliente_id', clienteId)
          // Storico contratti ordinato per data stipula (data commerciale)
          .order('data_stipula', { ascending: false }),
      ])
      if (resCli.error) throw resCli.error
      if (resCtr.error) throw resCtr.error
      setData(resCli.data)
      setContratti(resCtr.data || [])
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setEditing(false)
    fetchTutto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clienteId])

  // All'entrata in editing pre-popolo il form
  useEffect(() => {
    if (!editing || !data) return
    setForm({
      categoria: data.categoria,
      nome: data.nome || '',
      cognome: data.cognome || '',
      ragione_sociale: data.ragione_sociale || '',
      codice_fiscale: data.codice_fiscale || '',
      p_iva: data.p_iva || '',
      email: data.email || '',
      telefono: data.telefono || '',
      telefono_fisso: data.telefono_fisso || '',
      iban: data.iban || '',
      pod: data.pod || '',
      pdr: data.pdr || '',
    })
  }, [editing, data])

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function salva() {
    try {
      // Validazioni minime
      if (!form.codice_fiscale) throw new Error('Codice Fiscale obbligatorio')
      if (!form.email) throw new Error('Email obbligatoria')
      if (!form.telefono) throw new Error('Telefono obbligatorio')
      if (form.categoria === 'privato' && (!form.nome || !form.cognome)) {
        throw new Error('Nome e cognome obbligatori per cliente Privato')
      }
      if (form.categoria === 'azienda' && !form.ragione_sociale) {
        throw new Error('Ragione sociale obbligatoria per cliente Azienda')
      }

      // Validazione formati (email/cf/piva) → chiede "Inserisci comunque" se non validi
      const errors = validaCampiCliente({
        email: form.email,
        piva: form.categoria === 'azienda' ? form.p_iva : null,
        cf: form.codice_fiscale,
      })
      const haErrori = Object.values(errors).some(v => v)
      if (haErrori) {
        const procedi = confermaInserimentoForzato(errors)
        if (!procedi) return
      }
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
      return
    }

    setSaving(true)
    try {

      const payload = {
        categoria: form.categoria,
        nome: form.nome.trim() || null,
        cognome: form.cognome.trim() || null,
        ragione_sociale: form.categoria === 'azienda' ? (form.ragione_sociale.trim() || null) : null,
        codice_fiscale: form.codice_fiscale.toUpperCase().trim(),
        p_iva: form.categoria === 'azienda' ? (form.p_iva.trim() || null) : null,
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        telefono_fisso: form.telefono_fisso.trim() || null,
        iban: form.iban.trim() || null,
        pod: form.pod.trim() || null,
        pdr: form.pdr.trim() || null,
      }
      const { error } = await supabase
        .from('clienti').update(payload).eq('id', clienteId)
      if (error) throw error

      toast.success('Cliente aggiornato.')
      setEditing(false)
      await fetchTutto()
      onSaved?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Stats cliente
  const stats = useMemo(() => {
    let totale = contratti.length
    let validati = 0, gettonati = 0, ko = 0
    let punti = 0, fatturatoPdv = 0
    for (const c of contratti) {
      if (c.stato === 'validato') validati++
      if (c.stato === 'gettonato') gettonati++
      if (c.stato === 'ko' || c.stato === 'ko_non_validato') ko++
      // somma punti/fatturato (snapshot per gettonati/stornati)
      if (c.stato === 'gettonato' || c.stato === 'stornato') {
        punti += c.punti_snap || 0
        fatturatoPdv += c.fatturato_pdv_snap || 0
      } else {
        const sps = (c.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
        punti += sps.reduce((s, sp) => s + (sp.punti || 0), 0)
        fatturatoPdv += sps.reduce((s, sp) => s + (sp.fatturato_pdv || 0), 0)
      }
    }
    return { totale, validati, gettonati, ko, punti, fatturatoPdv }
  }, [contratti])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      size="lg"
      title={data ? `Cliente · ${nomeCliente(data)}` : 'Cliente'}
      description={data?.codice_fiscale ? `CF: ${data.codice_fiscale}` : ''}
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              <X size={14} /> Annulla
            </Button>
            <Button onClick={salva} loading={saving}>
              <Save size={14} /> Salva modifiche
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Chiudi</Button>
            {isBoAdmin && data && (
              <Button onClick={() => setEditing(true)}>
                <Edit3 size={14} /> Modifica
              </Button>
            )}
          </>
        )
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      ) : !data ? (
        <p className="py-10 text-center text-text-muted">Cliente non trovato.</p>
      ) : editing ? (
        <FormCliente form={form} setF={setF} />
      ) : (
        <ViewCliente data={data} contratti={contratti} stats={stats} isHr={isHr} />
      )}
    </Dialog>
  )
}

// ---------- View ----------

function ViewCliente({ data, contratti, stats, isHr = false }) {
  // Tendina espandi/comprimi per vedere i sottoprodotti di ciascun contratto
  const [aperti, setAperti] = useState(() => new Set())
  function toggleAperto(id) {
    setAperti(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      {/* Header con tipologia */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-bg/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
            <User size={18} />
          </div>
          <div>
            <div className="text-xs text-text-muted">Tipologia</div>
            <Badge tone={data.categoria === 'azienda' ? 'info' : 'accent'}>
              {data.categoria === 'azienda' ? 'Azienda' : 'Privato'}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-muted">Contratti totali</div>
          <div className="text-2xl font-medium tabular-nums text-white">{stats.totale}</div>
        </div>
      </div>

      {/* Stats compatte — HR non vede Fatt. PdV (2026-07) */}
      {stats.totale > 0 && (
        <div className={cn(
          'grid gap-3',
          isHr ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
        )}>
          <Mini label="Validati" value={formatInt(stats.validati)} />
          <Mini label="Gettonati" value={formatInt(stats.gettonati)} />
          <Mini label="Punti tot." value={formatInt(stats.punti)} />
          {!isHr && <Mini label="Fatt. PdV" value={formatEuro(stats.fatturatoPdv)} />}
        </div>
      )}

      {/* Anagrafica */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Info icon={User} label="Nome">
          {data.categoria === 'azienda' ? (
            <div className="text-white">{data.ragione_sociale || '—'}</div>
          ) : (
            <div className="text-white">{data.nome} {data.cognome}</div>
          )}
        </Info>
        <Info icon={CreditCard} label="Codice Fiscale">
          <div className="tabular-nums text-white">{data.codice_fiscale}</div>
          {data.p_iva && (
            <div className="mt-0.5 text-xs text-text-muted tabular-nums">P.IVA: {data.p_iva}</div>
          )}
        </Info>
        <Info icon={Mail} label="Contatti">
          <div className="text-white">{data.email}</div>
          <div className="text-xs text-text-muted">
            📱 {data.telefono || '—'}
            {data.telefono_fisso && <span className="ml-2">☎ {data.telefono_fisso}</span>}
          </div>
        </Info>
        <Info icon={CreditCard} label="Bancari / Utenza">
          <div className="text-xs text-white tabular-nums break-all">{data.iban || <span className="text-text-muted">IBAN: —</span>}</div>
          {(data.pod || data.pdr) && (
            <div className="mt-1 text-xs text-text-muted tabular-nums">
              {data.pod && `POD: ${data.pod}`}
              {data.pod && data.pdr && ' · '}
              {data.pdr && `PDR: ${data.pdr}`}
            </div>
          )}
        </Info>
      </div>

      {/* Storico contratti */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-bg/30 px-4 py-2 text-xs uppercase tracking-wider text-text-muted">
          <FileText size={12} /> Storico contratti ({contratti.length})
        </div>
        {contratti.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">Nessun contratto.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="w-8 px-2 py-2"></th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Codice contratto</th>
                <th className="px-4 py-2 font-medium">PdV</th>
                <th className="px-4 py-2 font-medium">Prodotto</th>
                <th className="px-4 py-2 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {contratti.map(c => {
                const sm = STATI[c.stato]
                const pm = PRODOTTI[c.prodotto]
                // Estraggo i sottoprodotti del contratto (relazione N:M)
                const sps = (c.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
                const isAperto = aperti.has(c.id)
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => toggleAperto(c.id)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-white/5"
                      title={isAperto ? 'Comprimi dettaglio sottoprodotti' : 'Espandi per vedere i sottoprodotti'}
                    >
                      <td className="px-2 py-2 text-text-muted">
                        {isAperto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {/* Data stipula in evidenza + data registrazione sotto */}
                        <div className="text-white">{formatDate(c.data_stipula || c.data_sottoscrizione)}</div>
                        {c.data_stipula && c.data_stipula !== c.data_sottoscrizione && (
                          <div className="text-[11px] text-text-muted">reg. {formatDate(c.data_sottoscrizione)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-white tabular-nums break-all">
                        {c.codice_contratto || <span className="text-warning">—</span>}
                      </td>
                      <td className="px-4 py-2 text-white">{c.pdv?.nome || '—'}</td>
                      <td className="px-4 py-2">
                        {pm && <Badge tone={pm.tone}>{pm.label}</Badge>}
                      </td>
                      <td className="px-4 py-2">
                        {sm && <Badge tone={sm.tone}>{sm.label}</Badge>}
                      </td>
                    </tr>
                    {isAperto && (
                      <tr className="border-t border-border bg-bg/40">
                        <td></td>
                        <td colSpan={5} className="px-4 py-3">
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted">
                            <Package size={12} /> Sottoprodotti venduti ({sps.length})
                          </div>
                          {sps.length === 0 ? (
                            <div className="text-xs text-text-muted">Nessun sottoprodotto associato a questo contratto.</div>
                          ) : (
                            <ul className="space-y-1">
                              {sps.map(sp => (
                                <li
                                  key={sp.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-1.5"
                                >
                                  <span className="text-sm text-white">{sp.nome}</span>
                                  <span className="text-xs tabular-nums text-text-muted">
                                    {formatInt(sp.punti)} pt
                                    {!isHr && ` · ${formatEuro(sp.fatturato_pdv)}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------- Form ----------

function FormCliente({ form, setF }) {
  return (
    <div className="space-y-4">
      <Select label="Tipologia" required value={form.categoria}
        onChange={e => setF('categoria', e.target.value)}>
        <option value="privato">Privato</option>
        <option value="azienda">Azienda</option>
      </Select>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {form.categoria === 'privato' ? (
          <>
            <Input label="Nome" required value={form.nome} onChange={e => setF('nome', e.target.value)} />
            <Input label="Cognome" required value={form.cognome} onChange={e => setF('cognome', e.target.value)} />
          </>
        ) : (
          <div className="sm:col-span-2">
            <Input label="Ragione sociale" required value={form.ragione_sociale} onChange={e => setF('ragione_sociale', e.target.value)} />
          </div>
        )}

        <Input label="Codice Fiscale" required maxLength={16}
          value={form.codice_fiscale} onChange={e => setF('codice_fiscale', e.target.value.toUpperCase())} />
        {form.categoria === 'azienda' && (
          <Input label="P.IVA" required value={form.p_iva} onChange={e => setF('p_iva', e.target.value)} />
        )}

        <Input label="Email" type="email" required value={form.email} onChange={e => setF('email', e.target.value)} />
        <Input label="Telefono (cellulare)" type="tel" required value={form.telefono} onChange={e => setF('telefono', e.target.value)} />
        <Input label="Telefono fisso" type="tel" hint="Opzionale" value={form.telefono_fisso} onChange={e => setF('telefono_fisso', e.target.value)} />
        <Input label="IBAN" hint="Opzionale" value={form.iban} onChange={e => setF('iban', e.target.value)} />

        <Input label="POD (Energia)" hint="Opzionale" value={form.pod} onChange={e => setF('pod', e.target.value)} />
        <Input label="PDR (Gas)" hint="Opzionale" value={form.pdr} onChange={e => setF('pdr', e.target.value)} />
      </div>
    </div>
  )
}

function Info({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted">
        <Icon size={12} /> {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="text-base font-medium tabular-nums text-white">{value}</div>
    </div>
  )
}
