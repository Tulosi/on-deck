import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { TitleDetail } from './pages/TitleDetail'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { NotFound } from './pages/Placeholders'
import { SharedList } from './pages/SharedList'
import { Settings } from './pages/Settings'
import { Waitlist } from './pages/Waitlist'
import { CollectionDetail, Collections } from './pages/Collections'
import { AuthProvider } from './lib/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false } },
})

// BASE_URL is "/" in dev and "/on-deck/" on GitHub Pages.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/s/:token" element={<SharedList />} />
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="library" element={<Library />} />
            {/* Old category pages → Library shortcuts. */}
            <Route path="movies" element={<Navigate to="/library?type=movie" replace />} />
            <Route path="tv" element={<Navigate to="/library?type=tv" replace />} />
            <Route path="games" element={<Navigate to="/library?type=game" replace />} />
            <Route path="books" element={<Navigate to="/library?type=book" replace />} />
            <Route path="title/:id" element={<TitleDetail />} />
            <Route path="waitlist" element={<Waitlist />} />
            <Route path="collections" element={<Collections />} />
            <Route path="collections/:id" element={<CollectionDetail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="login" element={<Login />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
