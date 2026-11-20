import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { CategoryPage } from './pages/CategoryPage'
import { TitleDetail } from './pages/TitleDetail'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { Collections, NotFound, Settings, SharedList } from './pages/Placeholders'
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
            <Route path="movies" element={<CategoryPage key="movie" mediaType="movie" />} />
            <Route path="tv" element={<CategoryPage key="tv" mediaType="tv" />} />
            <Route path="games" element={<CategoryPage key="game" mediaType="game" />} />
            <Route path="books" element={<CategoryPage key="book" mediaType="book" />} />
            <Route path="title/:id" element={<TitleDetail />} />
            <Route path="collections" element={<Collections />} />
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
