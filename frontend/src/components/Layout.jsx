import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './Layout.module.css'

const NAV_ITEMS = {
  encargado: [
    { to: '/encargado', label: 'Inicio', icon: '⌂', end: true },
  ],
  supervisor: [
    { to: '/supervisor', label: 'Tiendas', icon: '⊞', end: true },
    { to: '/supervisor/descarga', label: 'Exportar', icon: '⬇' },
  ],
  gerente: [
    { to: '/gerente', label: 'Resumen', icon: '◈', end: true },
    { to: '/gerente/metas', label: 'Metas', icon: '◎' },
    { to: '/gerente/sucursales', label: 'Sucursal', icon: '⊟' },
    { to: '/gerente/usuarios', label: 'Usuarios', icon: '◉' },
    { to: '/gerente/descarga', label: 'Exportar', icon: '⬇' },
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

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // Nombre corto para header (primer nombre solo)
  const nombreCorto = usuario?.nombre?.split(' ')[0] ?? '—'

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      {items.length > 1 && (
        <nav className={styles.bottomNav}>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navActive : ''}`
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
