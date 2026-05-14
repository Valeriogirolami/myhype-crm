-- ============================================================================
-- Migration: permessi DELETE su contratti e clienti per Admin + BO.
--
-- Lo schema originario aveva DELETE contratti solo per Admin e nessuna policy
-- per DELETE clienti. Lo allarghiamo a Admin/BO per gestire la cancellazione
-- dal dialog dettaglio contratto.
-- ============================================================================

-- Sostituisco la policy esistente (drop + create per essere idempotente)
drop policy if exists "contratti_delete_admin" on public.contratti;

create policy "contratti_delete_admin_bo"
  on public.contratti for delete
  using (public.current_user_role() in ('admin', 'bo'));

-- Permesso DELETE clienti per Admin/BO (mancava completamente)
drop policy if exists "clienti_delete_admin_bo" on public.clienti;

create policy "clienti_delete_admin_bo"
  on public.clienti for delete
  using (public.current_user_role() in ('admin', 'bo'));

-- ============================================================================
-- Fine. Ora Admin e BO possono cancellare contratti e clienti.
-- ============================================================================
