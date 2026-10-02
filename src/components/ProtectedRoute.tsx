import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import type { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, appUser, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0F766E] border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Carregando permissões...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If user is logged in but role doesn't permit this route, redirect to /dashboard
  if (allowedRoles && appUser && !allowedRoles.includes(appUser.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
