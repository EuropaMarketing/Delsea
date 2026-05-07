import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { applyBrandTheme } from '@/lib/theme'
import brand from '@/config/brand'
import { supabase } from '@/lib/supabase'
import { useAuthListener } from '@/hooks/useAuth'
import { useBrandStore, hasCachedBrand } from '@/store/brandStore'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

// Layouts
import { BookingLayout } from '@/components/layout/BookingLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'

import Landing from '@/pages/Landing'

// Booking flow pages
import ServiceSelection from '@/pages/booking/ServiceSelection'
import StaffSelection from '@/pages/booking/StaffSelection'
import DateTimePicker from '@/pages/booking/DateTimePicker'
import CustomerDetails from '@/pages/booking/CustomerDetails'
import Confirmation from '@/pages/booking/Confirmation'
import MyBookings from '@/pages/booking/MyBookings'
import BookingConfirmed from '@/pages/booking/BookingConfirmed'
import RescheduleConfirm from '@/pages/booking/RescheduleConfirm'
import MembershipPlans from '@/pages/booking/MembershipPlans'
import MembershipConfirmed from '@/pages/booking/MembershipConfirmed'
import About from '@/pages/booking/About'

// Admin pages
import ResetPassword from '@/pages/ResetPassword'
import AdminLogin from '@/pages/admin/Login'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminCalendar from '@/pages/admin/Calendar'
import AdminBookings from '@/pages/admin/Bookings'
import AdminServices from '@/pages/admin/Services'
import AdminStaff from '@/pages/admin/Staff'
import AdminSettings from '@/pages/admin/Settings'
import AdminMemberships from '@/pages/admin/Memberships'
import AdminClients from '@/pages/admin/Clients'
import AdminPayroll from '@/pages/admin/Payroll'
import AdminPortfolio from '@/pages/admin/Portfolio'
import AdminReviews from '@/pages/admin/Reviews'

function AppRoutes() {
  useAuthListener()

  return (
    <Routes>
      {/* Landing */}
      <Route path="/" element={<Landing />} />

      {/* Public booking flow */}
      <Route
        path="/book"
        element={
          <BookingLayout>
            <ServiceSelection />
          </BookingLayout>
        }
      />
      <Route
        path="/staff"
        element={
          <BookingLayout>
            <StaffSelection />
          </BookingLayout>
        }
      />
      <Route
        path="/datetime"
        element={
          <BookingLayout>
            <DateTimePicker />
          </BookingLayout>
        }
      />
      <Route
        path="/details"
        element={
          <BookingLayout>
            <CustomerDetails />
          </BookingLayout>
        }
      />
      <Route
        path="/confirm"
        element={
          <BookingLayout>
            <Confirmation />
          </BookingLayout>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <BookingLayout>
            <MyBookings />
          </BookingLayout>
        }
      />
      <Route
        path="/booking-confirmed"
        element={
          <BookingLayout>
            <BookingConfirmed />
          </BookingLayout>
        }
      />
      <Route
        path="/reschedule-confirm"
        element={
          <BookingLayout>
            <RescheduleConfirm />
          </BookingLayout>
        }
      />
      <Route
        path="/memberships"
        element={
          <BookingLayout>
            <MembershipPlans />
          </BookingLayout>
        }
      />
      <Route
        path="/membership-confirmed"
        element={
          <BookingLayout>
            <MembershipConfirmed />
          </BookingLayout>
        }
      />
      <Route
        path="/about"
        element={
          <BookingLayout>
            <About />
          </BookingLayout>
        }
      />

      {/* Password reset (linked from email) */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Admin auth */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin dashboard (protected) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/calendar"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminCalendar />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/bookings"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminBookings />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/services"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminServices />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/staff"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminStaff />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/memberships"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminMemberships />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/clients"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminClients />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payroll"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminPayroll />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/portfolio"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminPortfolio />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reviews"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminReviews />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout>
              <AdminSettings />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const { setConfig } = useBrandStore()
  // Repeat visits: hasCachedBrand=true (theme already applied synchronously), skip loading screen
  // First visit: show blank white until Supabase config arrives
  const [brandLoaded, setBrandLoaded] = useState(hasCachedBrand)

  useEffect(() => {
    supabase
      .from('businesses')
      .select('config')
      .eq('id', BUSINESS_ID)
      .single()
      .then(({ data }) => {
        const merged = data?.config ? { ...brand, ...data.config } : brand
        applyBrandTheme(merged)
        setConfig(merged)
        document.title = merged.brandName
        setBrandLoaded(true)
      })
  }, [setConfig])

  if (!brandLoaded) {
    return <div className="h-screen w-screen bg-white" />
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
