/**
 * App root — definisce il routing globale (§9.1).
 * - /login è pubblica
 * - Tutte le altre rotte sono protette (ProtectedRoute) e passano da Layout
 * - La pagina Admin richiede ruoli admin o bo (§11)
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Pdv from './pages/Pdv'
import Prodotti from './pages/Prodotti'
import Collaboratori from './pages/Collaboratori'
import Contratti from './pages/Contratti'
import Clienti from './pages/Clienti'
import Target from './pages/Target'
import Classifiche from './pages/Classifiche'
import GaraGallery from './pages/GaraGallery'
import Simulatore from './pages/Simulatore'
import Organigramma from './pages/Organigramma'
import Admin from './pages/Admin'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotta pubblica */}
        <Route path="/login" element={<Login />} />

        {/* Rotte protette (richiedono login) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="contratti"    element={<Contratti />} />
            <Route path="clienti"      element={<Clienti />} />
            <Route path="classifiche"  element={<Classifiche />} />
            <Route path="target"       element={<Target />} />
            <Route path="organigramma" element={<Organigramma />} />
            <Route path="*"            element={<Placeholder title="404"           description="Pagina non trovata." step="—" />} />
          </Route>

          {/* Area PdV / Collaboratori — non accessibile al ruolo 'pdv' (§11).
              HR (2026-07) può vedere le anagrafiche ma non modificarle. */}
          <Route element={<ProtectedRoute roles={['admin','bo','dv','as','tm','hr']} />}>
            <Route element={<Layout />}>
              <Route path="pdv"           element={<Pdv />} />
              <Route path="collaboratori" element={<Collaboratori />} />
            </Route>
          </Route>

          {/* Area Prodotti — admin/bo */}
          <Route element={<ProtectedRoute roles={['admin','bo']} />}>
            <Route element={<Layout />}>
              <Route path="prodotti" element={<Prodotti />} />
            </Route>
          </Route>

          {/* Area Gara Gallery + Simulatore — solo Admin (§11) */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route element={<Layout />}>
              <Route path="gara-gallery" element={<GaraGallery />} />
              <Route path="simulatore"   element={<Simulatore />} />
            </Route>
          </Route>

          {/* Area Admin — accessibile a Admin/BO/HR (HR aggiunto 2026-07 per gestione account) */}
          <Route element={<ProtectedRoute roles={['admin','bo','hr']} />}>
            <Route element={<Layout />}>
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
