import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, startOfMonth } from 'date-fns'
import {
  Globe, Users, Store, ChevronRight, Plus,
  TrendingUp, ShieldCheck, Activity
} from 'lucide-react'
import styles from './Dashboard.module.css'
import PageSkeleton from '../../components/PageSkeleton'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [zonas,   setZonas]   = useState([])
  const [stats,   setStats]   = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const desde = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const hasta = format(new Date(), 'yyyy-MM-dd')

      const [
        { data: zonasData },
        { data: sucsData },
        { data: usersData },
        { data: ventasData },
      ] = await Promise.all([
        supabase.from('zonas').select('*').order('nombre'),
        supabase.from('sucursales').select('id, zona_id, activa'),
        supabase.from('usuarios').select('zona_id, roles(nombre)'),
        supabase.from('ventas_diarias')
          .select('sucursal_id, venta_total')
          .gte('fecha', desde).lte('fecha', hasta),
      ])

      // Mapa sucursal_id → zona_id
      const sucToZona = {}
      const sucByZona = {}
      sucsData?.forEach(s => {
        if (!s.zona_id) return
        sucToZona[s.id] = s.zona_id
        if (!sucByZona[s.zona_id]) sucByZona[s.zona_id] = { total: 0, activas: 0 }
        sucByZona[s.zona_id].total++
        if (s.activa) sucByZona[s.zona_id].activas++
      })

      const usersByZona = {}
      usersData?.forEach(u => {
        if (!u.zona_id || u.roles?.nombre === 'superadmin') return
        usersByZona[u.zona_id] = (usersByZona[u.zona_id] ?? 0) + 1
      })

      const ventasByZona = {}
      ventasData?.forEach(v => {
        const zid = sucToZona[v.sucursal_id]
        if (!zid) return
        ventasByZona[zid] = (ventasByZona[zid] ?? 0) + v.venta_total
      })

      const statsMap = {}
      zonasData?.forEach(z => {
        statsMap[z.id] = {
          sucursales: sucByZona[z.id]?.activas ?? 0,
          usuarios:   usersByZona[z.id] ?? 0,
          ventas:     ventasByZona[z.id] ?? 0,
        }
      })

      setZonas(zonasData ?? [])
      setStats(statsMap)
    } catch (e) {
      console.error('SuperAdmin Dashboard error:', e)
    } finally {
      setLoading(false)
    }
  }

  const totalZonas   = zonas.filter(z => z.activa).length
  const totalSucs    = Object.values(stats).reduce((a, s) => a + s.sucursales, 0)
  const totalUsers   = Object.values(stats).reduce((a, s) => a + s.usuarios, 0)
  const totalVentas  = Object.values(stats).reduce((a, s) => a + s.ventas, 0)

  if (loading) return <PageSkeleton rows={4} />

  return (
    <div className={styles.page}>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <ShieldCheck size={22} strokeWidth={1.75} />
        </div>
        <div>
          <p className={styles.heroTitle}>Vista Global</p>
          <p className={styles.heroSub}>Todas las zonas de El Pechugón</p>
        </div>
      </div>

      {/* Stats chips */}
      <div className={styles.statsRow}>
        <div className={styles.statChip}>
          <Globe size={14} strokeWidth={1.75} color="var(--info)" />
          <span className={styles.statVal}>{totalZonas}</span>
          <span className={styles.statLabel}>Zonas</span>
        </div>
        <div className={styles.statChip}>
          <Store size={14} strokeWidth={1.75} color="var(--success)" />
          <span className={styles.statVal}>{totalSucs}</span>
          <span className={styles.statLabel}>Sucursales</span>
        </div>
        <div className={styles.statChip}>
          <Users size={14} strokeWidth={1.75} color="var(--yellow)" />
          <span className={styles.statVal}>{totalUsers}</span>
          <span className={styles.statLabel}>Usuarios</span>
        </div>
        <div className={styles.statChip}>
          <TrendingUp size={14} strokeWidth={1.75} color="var(--success)" />
          <span className={styles.statVal}>{fmt(totalVentas)}</span>
          <span className={styles.statLabel}>Mes</span>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={() => navigate('/superadmin/zonas')}>
          <Globe size={18} strokeWidth={1.75} />
          <span>Gestionar Zonas</span>
        </button>
        <button className={styles.actionBtn} onClick={() => navigate('/superadmin/usuarios')}>
          <Users size={18} strokeWidth={1.75} />
          <span>Gestionar Usuarios</span>
        </button>
      </div>

      {/* Zona list */}
      <div className={styles.secHeader}>
        <p className={styles.secTitle}>
          {zonas.length} zona{zonas.length !== 1 ? 's' : ''}
        </p>
        <button className={styles.newBtn} onClick={() => navigate('/superadmin/zonas')}>
          <Plus size={13} strokeWidth={2.5} /> Nueva zona
        </button>
      </div>

      <div className={styles.zonaList}>
        {zonas.length === 0 && (
          <div className={styles.empty}>
            Sin zonas — crea la primera en "Gestionar Zonas"
          </div>
        )}
        {zonas.map(zona => {
          const s = stats[zona.id] ?? { sucursales: 0, usuarios: 0, ventas: 0 }
          return (
            <div
              key={zona.id}
              className={styles.zonaCard}
              onClick={() => navigate(`/superadmin/zona/${zona.id}`)}
            >
              <div className={styles.zonaTop}>
                <div className={styles.zonaIconWrap}>
                  <Globe size={15} strokeWidth={1.75} />
                </div>
                <div className={styles.zonaInfo}>
                  <p className={styles.zonaNombre}>{zona.nombre}</p>
                  {zona.descripcion && (
                    <p className={styles.zonaDesc}>{zona.descripcion}</p>
                  )}
                </div>
                <span className={`${styles.zonaBadge} ${zona.activa ? styles.zonaBadgeOk : styles.zonaBadgeOff}`}>
                  {zona.activa ? 'Activa' : 'Inactiva'}
                </span>
                <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" />
              </div>

              <div className={styles.zonaMetas}>
                <div className={styles.zonaMeta}>
                  <span className={styles.zonaMetaVal}>{s.sucursales}</span>
                  <span className={styles.zonaMetaLabel}>Sucursales</span>
                </div>
                <div className={styles.zonaMetaDivider} />
                <div className={styles.zonaMeta}>
                  <span className={styles.zonaMetaVal}>{s.usuarios}</span>
                  <span className={styles.zonaMetaLabel}>Usuarios</span>
                </div>
                <div className={styles.zonaMetaDivider} />
                <div className={styles.zonaMeta}>
                  <span className={`${styles.zonaMetaVal} mono`}>{fmt(s.ventas)}</span>
                  <span className={styles.zonaMetaLabel}>Ventas mes</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
