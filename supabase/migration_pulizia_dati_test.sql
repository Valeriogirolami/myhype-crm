-- ============================================================================
-- Migration: pulizia completa dati di test
--
-- Cancella TUTTO eccetto gli account Admin e Back Office.
-- Da eseguire UNA VOLTA quando si vuole ripartire da zero con dati reali.
--
-- ⚠️ ATTENZIONE: questa migration è DISTRUTTIVA. Verrà chiesta conferma
-- dal SQL Editor di Supabase prima dell'esecuzione.
--
-- Cosa NON cancella:
--  - Account utenti con ruolo 'admin' o 'bo'
--  - Auth users (vanno cancellati manualmente da Auth dashboard se servono)
-- ============================================================================

-- 1) Storia contratti (cascade gestisce contratto_sottoprodotti, ma per sicurezza)
delete from public.contratto_sottoprodotti;
delete from public.contratti;

-- 2) Clienti (orfani dopo delete contratti)
delete from public.clienti;

-- 3) Notifiche (puliamo anche quelle vecchie)
delete from public.notifiche;

-- 4) Associazioni e target
delete from public.pdv_collaboratori;
delete from public.target_pdv_override;
delete from public.target_base;
delete from public.gara_gallery_soglie;

-- 5) Sottoprodotti
delete from public.sottoprodotti;

-- 6) PdV (prima azzero account_id per sicurezza)
update public.pdv set account_id = null;
delete from public.pdv;

-- 7) Collaboratori (idem azzero account_id)
update public.collaboratori set account_id = null;
delete from public.collaboratori;

-- 8) Account utenti applicativi NON admin/bo
-- Nota: cancella la riga in public.utenti. La riga corrispondente in
-- auth.users va eliminata manualmente da Supabase Dashboard → Authentication
-- → Users (se vuoi liberare le email per riusarle).
delete from public.utenti where ruolo not in ('admin', 'bo');

-- ============================================================================
-- Fine pulizia. Restano solo:
--   - utenti admin / bo (in public.utenti e auth.users)
--   - schema, policy RLS, edge functions
-- ============================================================================
