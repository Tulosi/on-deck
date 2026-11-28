import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/chivo'
import '@fontsource-variable/chivo-mono'
import './index.css'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { NotFound } from './pages/Placeholders'
import { lazyPage } from './components/LazyPage'
import { watchForUpdates } from './lib/pwaUpdate'

// Home and Library are where most visits land, so they ship in the main bundle.
// Everything else loads when first opened.
const TitleDetail = lazyPage(() => import('./pages/TitleDetail'), 'TitleDetail')
const TitlePreview = lazyPage(() => import('./pages/TitlePreview'), 'TitlePreview')
const Login = lazyPage(() => import('./pages/Login'), 'Login')
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'), 'ResetPassword')
const SharedList = lazyPage(() => import('./pages/SharedList'), 'SharedList')
const Settings = lazyPage(() => import('./pages/Settings'), 'Settings')
const Waitlist = lazyPage(() => import('./pages/Waitlist'), 'Waitlist')
const SearchPage = lazyPage(() => import('./pages/Search'), 'SearchPage')
const ImportPage = lazyPage(() => import('./pages/Import'), 'ImportPage')
const Collections = lazyPage(() => import('./pages/Collections'), 'Collections')
const CollectionDetail = lazyPage(() => import('./pages/Collections'), 'CollectionDetail')

/** The Waitlist page was renamed Calendar; old links keep working. */
function RedirectWaitlist() {
  const { search } = useLocation()
  return <Navigate to={`/calendar${search.replace('view=calendar', 'view=month')}`} replace />
}
import { AuthProvider } from './lib/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false } },
})

// The title page is opened from almost everywhere: load its code once the app is idle, so the first poster tap
// can morph straight into it instead of waiting on a loading placeholder.
const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
idle(() => TitleDetail.preload())

watchForUpdates()

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
            <Route path="preview/:type/:source/:id" element={<TitlePreview />} />
            <Route path="calendar" element={<Waitlist />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="import/:source" element={<ImportPage />} />
            <Route path="waitlist" element={<RedirectWaitlist />} />
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
