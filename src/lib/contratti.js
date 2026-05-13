/**
 * Helper condivisi per la gestione contratti.
 */

// Etichette + toni per i 6 stati possibili (§4.5)
export const STATI = {
  da_validare:     { label: 'Da validare',     tone: 'warning' },
  ko_non_validato: { label: 'KO non validato', tone: 'danger'  },
  validato:        { label: 'Validato',        tone: 'info'    },
  ko:              { label: 'KO',              tone: 'danger'  },
  gettonato:       { label: 'Gettonato',       tone: 'success' },
  stornato:        { label: 'Stornato',        tone: 'neutral' },
}

export const PRODOTTI = {
  mobile:  { label: 'Mobile',  tone: 'accent'  },
  fisso:   { label: 'Fisso',   tone: 'info'    },
  energia: { label: 'Energia', tone: 'warning' },
}

/**
 * Calcola i totali di un contratto dalla lista dei sottoprodotti selezionati.
 * Restituisce: { punti, fatturato_azienda, fatturato_pdv }
 */
export function calcolaTotali(sottoprodotti) {
  return (sottoprodotti || []).reduce(
    (acc, sp) => ({
      punti: acc.punti + (Number(sp?.punti) || 0),
      fatturato_azienda: acc.fatturato_azienda + (Number(sp?.fatturato_azienda) || 0),
      fatturato_pdv: acc.fatturato_pdv + (Number(sp?.fatturato_pdv) || 0),
    }),
    { punti: 0, fatturato_azienda: 0, fatturato_pdv: 0 },
  )
}

/** Nome completo cliente (Azienda → ragione sociale, altrimenti Nome + Cognome) */
export function nomeCliente(c) {
  if (!c) return '—'
  if (c.categoria === 'azienda' && c.ragione_sociale) return c.ragione_sociale
  return `${c.nome ?? ''} ${c.cognome ?? ''}`.trim() || '—'
}
