import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import EncargadoDashboard from './pages/encargado/Dashboard'
import SupervisorDashboard from './pages/supervisor/Dashboard'
import SupervisorSucursal from './pages/supervisor/Sucursal'
import SupervisorDescarga from './pages/supervisor/Descarga'
import SupervisorRegistro from './pages/supervisor/RegistroAtrasado'
import GerenteDashboard from './pages/gerente/Dashboard'
import GerenteSucursales from './pages/gerente/Sucursales'
import GerenteUsuarios from './pages/gerente/Usuarios'
import GerenteMetas from './pages/gerente/Metas'
import GerenteSucursalDetalle from './pages/gerente/SucursalDetalle'
import GerenteDescarga from './pages/gerente/Descarga'
import Layout from './components/Layout'
import Splash from './components/Splash'

function RequireAuth({ children, rolesPermitidos }) {
  const { session, rol, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (rolesPermitidos && !rolesPermitidos.includes(rol)) return <Navigate to="/" replace />
  return children
}

function RootRedirect() {
  const { rol, loading } = useAuth()
  if (loading) return <Splash />
  if (rol === 'encargado') return <Navigate to="/encargado" replace />
  if (rol === 'supervisor') return <Navigate to="/supervisor" replace />
  if (rol === 'gerente') return <Navigate to="/gerente" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RootRedirect />} />

      {/* ENCARGADO */}
      <Route path="/encargado" element={
        <RequireAuth rolesPermitidos={['encargado']}>
          <Layout rol="encargado" />
        </RequireAuth>
      }>
        <Route index element={<EncargadoDashboard />} />
      </Route>

      {/* SUPERVISOR */}
      <Route path="/supervisor" element={
        <RequireAuth rolesPermitidos={['supervisor']}>
          <Layout rol="supervisor" />
        </RequireAuth>
      }>
        <Route index element={<SupervisorDashboard />} />
        <Route path="sucursal/:id" element={<SupervisorSucursal />} />
        <Route path="registro" element={<SupervisorRegistro />} />
        <Route path="descarga" element={<SupervisorDescarga />} />
      </Route>

      {/* GERENTE */}
      <Route path="/gerente" element={
        <RequireAuth rolesPermitidos={['gerente']}>
          <Layout rol="gerente" />
        </RequireAuth>
      }>
        <Route index element={<GerenteDashboard />} />
        <Route path="metas" element={<GerenteMetas />} />
        <Route path="sucursales" element={<GerenteSucursales />} />
        <Route path="usuarios" element={<GerenteUsuarios />} />
        <Route path="sucursal/:id" element={<GerenteSucursalDetalle />} />
        <Route path="descarga" element={<GerenteDescarga />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
