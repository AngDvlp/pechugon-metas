import { Suspense, useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Target, Store, Users, Download, LogOut, Home,
  CalendarPlus, Utensils, Route, Package, BarChart2, Globe, ShieldCheck,
  MoreHorizontal, X, Sun, Moon, SunMoon
} from 'lucide-react'
import styles from './Layout.module.css'
import PageSkeleton from './PageSkeleton'
import { leerTema, aplicarTema, temaEfectivo } from '../lib/tema'

// Los primeros 3 de cada rol son los de uso diario y se quedan fijos en la
// barra; el resto pasa al menú "Más". Antes había hasta 8 botones en la barra,
// tan angostos que se picaban mal.
const NAV_ITEMS = {
  encargado: [
    { to: '/encargado', label: 'Inicio', icon: Home, end: true },
  ],
  supervisor: [
    { to: '/supervisor', label: 'Tiendas', icon: Store, end: true },
    { to: '/supervisor/reporte', label: 'Reporte', icon: BarChart2 },
    { to: '/supervisor/registro', label: 'Registrar', icon: CalendarPlus },
    { to: '/supervisor/pollos-taco', label: 'Taco', icon: Utensils },
    { to: '/supervisor/pedido-taco', label: 'Pedido', icon: Package },
    { to: '/supervisor/descarga', label: 'Exportar', icon: Download },
  ],
  suplente: [
    { to: '/suplente', label: 'Tiendas', icon: Store, end: true },
    { to: '/suplente/reporte', label: 'Reporte', icon: BarChart2 },
    { to: '/suplente/registro', label: 'Registrar', icon: CalendarPlus },
    { to: '/suplente/pollos-taco', label: 'Taco', icon: Utensils },
    { to: '/suplente/pedido-taco', label: 'Pedido', icon: Package },
    { to: '/suplente/descarga', label: 'Exportar', icon: Download },
  ],
  gerente: [
    { to: '/gerente', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/gerente/metas', label: 'Metas', icon: Target },
    { to: '/gerente/reporte', label: 'Reporte', icon: BarChart2 },
    { to: '/gerente/pollos-taco', label: 'Taco', icon: Utensils },
    { to: '/gerente/rutas', label: 'Rutas', icon: Route },
    { to: '/gerente/sucursales', label: 'Sucursales', icon: Store },
    { to: '/gerente/usuarios', label: 'Usuarios', icon: Users },
    { to: '/gerente/descarga', label: 'Exportar', icon: Download },
  ],
  cocina: [
    { to: '/cocina', label: 'Existencia', icon: Utensils, end: true },
    { to: '/cocina/pedidos', label: 'Pedidos', icon: Package },
  ],
  superadmin: [
    { to: '/superadmin', label: 'Global', icon: LayoutDashboard, end: true },
    { to: '/superadmin/zonas', label: 'Zonas', icon: Globe },
    { to: '/superadmin/usuarios', label: 'Usuarios', icon: Users },
  ],
}

const ROL_LABELS = {
  encargado:  'Encargado',
  supervisor: 'Supervisor',
  suplente:   'Supervisor Suplente',
  gerente:    'Gerente General',
  cocina:     'Cocina',
  superadmin: 'Super Administrador',
}

const MAX_FIJOS = 3   // + el botón "Más" = 4 lugares en la barra

const TEMA_SIG   = { auto: 'light', light: 'dark', dark: 'auto' }
const TEMA_ICONO = { auto: SunMoon, light: Sun, dark: Moon }
const TEMA_TXT   = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: oscuro' }

export default function Layout({ rol }) {
  const { usuario, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const items = NAV_ITEMS[rol] ?? []
  const nombreCorto = usuario?.nombre?.split(' ')[0] ?? '—'

  const [tema, setTema]   = useState(leerTema)
  const [masOpen, setMas] = useState(false)
  const masBtnRef = useRef(null)

  const fijos   = items.length > 4 ? items.slice(0, MAX_FIJOS) : items
  const enMenu  = items.length > 4 ? items.slice(MAX_FIJOS)    : []
  const menuActivo = enMenu.some(i => location.pathname === i.to)

  // Cerrar el menú al cambiar de pantalla
  useEffect(() => { setMas(false) }, [location.pathname])

  // Escape cierra el menú y devuelve el foco al botón que lo abrió
  useEffect(() => {
    if (!masOpen) return
    const onKey = e => {
      if (e.key === 'Escape') { setMas(false); masBtnRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [masOpen])

  function cambiarTema() {
    const sig = TEMA_SIG[tema]
    setTema(sig)
    aplicarTema(sig)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const TemaIcono = TEMA_ICONO[tema]

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brandRow}>
            <img src="/logo.png" alt="" className={styles.logoImg} />
            <span className={styles.brand}>El Pechugón</span>
          </div>
          <span className={`${styles.rolBadge} ${rol === 'superadmin' ? styles.rolBadgeSA : ''}`}>
            {rol === 'superadmin' && <ShieldCheck size={11} strokeWidth={2.5} />}
            {ROL_LABELS[rol]}
          </span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userName}>{nombreCorto}</span>
          <button
            className={styles.iconBtn}
            onClick={cambiarTema}
            title={`${TEMA_TXT[tema]} — toca para cambiar`}
            aria-label={`${TEMA_TXT[tema]}. Toca para cambiar de tema.`}>
            <TemaIcono size={16} strokeWidth={2} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={handleSignOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión">
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Menú "Más" — el velo cierra al tocar fuera */}
      {masOpen && (
        <>
          <button
            className={styles.masScrim}
            onClick={() => setMas(false)}
            aria-label="Cerrar menú"
          />
          <div className={styles.masSheet} role="menu" aria-label="Más secciones">
            <div className={styles.masHead}>
              <span className={styles.masTitle}>Más secciones</span>
              <button
                className={styles.masClose}
                onClick={() => setMas(false)}
                aria-label="Cerrar menú">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            {enMenu.map(item => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  className={({ isActive }) =>
                    `${styles.masItem} ${isActive ? styles.masItemActive : ''}`
                  }>
                  <Icon size={18} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        </>
      )}

      {items.length > 1 && (
        <nav className={styles.bottomNav} aria-label="Navegación principal">
          {fijos.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navActive : ''}`
                }>
                <Icon size={20} strokeWidth={1.75} />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            )
          })}

          {enMenu.length > 0 && (
            <button
              ref={masBtnRef}
              className={`${styles.navItem} ${menuActivo || masOpen ? styles.navActive : ''}`}
              onClick={() => setMas(v => !v)}
              aria-expanded={masOpen}
              aria-haspopup="menu">
              <MoreHorizontal size={20} strokeWidth={1.75} />
              <span className={styles.navLabel}>Más</span>
            </button>
          )}
        </nav>
      )}
    </div>
  )
}
