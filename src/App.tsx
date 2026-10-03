import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/use-auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import Dashboard from '@/pages/Dashboard'
import Upload from '@/pages/Upload'
import Pendencies from '@/pages/Pendencies'
import Customers from '@/pages/Customers'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<Login />} />

            {/* Mandatory Change Password Route (intercepted by ProtectedRoute) */}
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            {/* Protected Routes inside Global Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Default Redirect to Dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/reports" element={<Reports />} />

              {/* Admin & Manager Only Routes */}
              <Route
                path="/upload"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'manager']}>
                    <Upload />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pendencies"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'manager']}>
                    <Pendencies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'manager']}>
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* 404 Catch All */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
