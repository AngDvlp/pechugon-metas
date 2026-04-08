import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Target, Store, Users, Download, LogOut, Home, CalendarPlus
} from 'lucide-react'
import styles from './Layout.module.css'

const NAV_ITEMS = {
  encargado: [
    { to: '/encargado', label: 'Inicio', icon: Home, end: true },
  ],
  supervisor: [
    { to: '/supervisor', label: 'Tiendas', icon: Store, end: true },
    { to: '/supervisor/registro', label: 'Registrar', icon: CalendarPlus },
    { to: '/supervisor/descarga', label: 'Exportar', icon: Download },
  ],
  gerente: [
    { to: '/gerente', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/gerente/metas', label: 'Metas', icon: Target },
    { to: '/gerente/sucursales', label: 'Sucursal', icon: Store },
    { to: '/gerente/usuarios', label: 'Usuarios', icon: Users },
    { to: '/gerente/descarga', label: 'Exportar', icon: Download },
  ],
}

const ROL_LABELS = {
  encargado: 'Encargado',
  supervisor: 'Supervisor',
  gerente: 'Gerente General',
}

export default function Layout({ rol }) {
  const { usuario, signOut } = useAuth()
  const navigate = useNavigate()
  const items = NAV_ITEMS[rol] ?? []
  const nombreCorto = usuario?.nombre?.split(' ')[0] ?? '—'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brandRow}>
            <img src="/logo.png" alt="El Pechugón" className={styles.logoImg} />
            <span className={styles.brand}>El Pechugón</span>
          </div>
          <span className={styles.rolBadge}>{ROL_LABELS[rol]}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userName}>{nombreCorto}</span>
          <button className={styles.signOut} onClick={handleSignOut} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      {items.length > 1 && (
        <nav className={styles.bottomNav}>
          {items.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navActive : ''}`
                }
              >
                <Icon size={20} strokeWidth={1.75} />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
