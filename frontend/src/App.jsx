import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Splash from './components/Splash'

const Login                = lazy(() => import('./pages/Login'))
const EncargadoDashboard   = lazy(() => import('./pages/encargado/Dashboard'))
const SupervisorDashboard  = lazy(() => import('./pages/supervisor/Dashboard'))
const SupervisorSucursal   = lazy(() => import('./pages/supervisor/Sucursal'))
const SupervisorDescarga   = lazy(() => import('./pages/supervisor/Descarga'))
const SupervisorRegistro   = lazy(() => import('./pages/supervisor/RegistroAtrasado'))
const SupervisorPedidosTaco = lazy(() => import('./pages/supervisor/PedidosTaco'))
const SupervisorPollosTaco = lazy(() => import('./pages/supervisor/PollosTaco'))
const GerenteDashboard     = lazy(() => import('./pages/gerente/Dashboard'))
const GerenteSucursales    = lazy(() => import('./pages/gerente/Sucursales'))
const GerenteUsuarios      = lazy(() => import('./pages/gerente/Usuarios'))
const GerenteMetas         = lazy(() => import('./pages/gerente/Metas'))
const GerenteSucursalDetalle = lazy(() => import('./pages/gerente/SucursalDetalle'))
const GerenteDescarga      = lazy(() => import('./pages/gerente/Descarga'))
const GerentePollosTaco    = lazy(() => import('./pages/gerente/PollosTaco'))
const GerenteRutas         = lazy(() => import('./pages/gerente/Rutas'))
const GerenteReporte       = lazy(() => import('./pages/gerente/Reporte'))
const SuplenteDashboard    = lazy(() => import('./pages/suplente/Dashboard'))
const CocinaDashboard      = lazy(() => import('./pages/cocina/Dashboard'))
const CocinaPedidos        = lazy(() => import('./pages/cocina/Pedidos'))

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
  if (rol === 'suplente') return <Navigate to="/suplente" replace />
  if (rol === 'gerente') return <Navigate to="/gerente" replace />
  if (rol === 'cocina') return <Navigate to="/cocina" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Suspense fallback={<Splash />}>
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
          <Route path="pollos-taco" element={<SupervisorPollosTaco />} />
          <Route path="pedido-taco" element={<SupervisorPedidosTaco />} />
          <Route path="reporte" element={<GerenteReporte />} />
        </Route>

        {/* SUPLENTE */}
        <Route path="/suplente" element={
          <RequireAuth rolesPermitidos={['suplente']}>
            <Layout rol="suplente" />
          </RequireAuth>
        }>
          <Route index element={<SuplenteDashboard />} />
          <Route path="sucursal/:id" element={<SupervisorSucursal backPath="/suplente" />} />
          <Route path="registro" element={<SupervisorRegistro />} />
          <Route path="descarga" element={<SupervisorDescarga />} />
          <Route path="pollos-taco" element={<SupervisorPollosTaco />} />
          <Route path="pedido-taco" element={<SupervisorPedidosTaco />} />
          <Route path="reporte" element={<GerenteReporte />} />
        </Route>

        {/* COCINA */}
        <Route path="/cocina" element={
          <RequireAuth rolesPermitidos={['cocina']}>
            <Layout rol="cocina" />
          </RequireAuth>
        }>
          <Route index element={<CocinaDashboard />} />
          <Route path="pedidos" element={<CocinaPedidos />} />
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
          <Route path="pollos-taco" element={<GerentePollosTaco />} />
          <Route path="rutas" element={<GerenteRutas />} />
          <Route path="reporte" element={<GerenteReporte />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
