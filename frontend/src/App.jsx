import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import EncargadoDashboard from './pages/encargado/Dashboard'
import SupervisorDashboard from './pages/supervisor/Dashboard'
import SupervisorSucursal from './pages/supervisor/Sucursal'
import SupervisorDescarga from './pages/supervisor/Descarga'
import SupervisorRegistro from './pages/supervisor/RegistroAtrasado'
import SupervisorPedidosTaco from './pages/supervisor/PedidosTaco'
import GerenteDashboard from './pages/gerente/Dashboard'
import GerenteSucursales from './pages/gerente/Sucursales'
import GerenteUsuarios from './pages/gerente/Usuarios'
import GerenteMetas from './pages/gerente/Metas'
import GerenteSucursalDetalle from './pages/gerente/SucursalDetalle'
import GerenteDescarga from './pages/gerente/Descarga'
import GerentePollosTaco from './pages/gerente/PollosTaco'
import GerenteRutas from './pages/gerente/Rutas'
import GerenteReporte from './pages/gerente/Reporte'
import SupervisorPollosTaco from './pages/supervisor/PollosTaco'
import SuplenteDashboard from './pages/suplente/Dashboard'
import CocinaDashboard from './pages/cocina/Dashboard'
import CocinaPedidos from './pages/cocina/Pedidos'
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
  if (rol === 'suplente') return <Navigate to="/suplente" replace />
  if (rol === 'gerente') return <Navigate to="/gerente" replace />
  if (rol === 'cocina') return <Navigate to="/cocina" replace />
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
  )
}
