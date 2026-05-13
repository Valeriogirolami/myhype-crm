/**
 * Layout applicativo — Sidebar + TopBar + area contenuto (§9.1)
 * Wrappa tutte le pagine autenticate.
 */
import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import Toaster from './ui/Toaster'

export default function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {/* Animazione soft di entrata pagina (§0: 150-250ms) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mx-auto max-w-7xl"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      {/* Toast globali (montato una volta sola) */}
      <Toaster />
    </div>
  )
}
