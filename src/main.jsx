import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from '@/contexts/AuthContext'

// Nota: abbiamo rimosso <StrictMode> perché in dev causa un doppio mount
// che fa bloccare il lock di Supabase Auth per 5 secondi all'avvio.
// In produzione non è attivo di default e non influisce.
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
)
