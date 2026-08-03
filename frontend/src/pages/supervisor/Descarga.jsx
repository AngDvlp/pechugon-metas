import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { Eye, Download, Calendar, Check } from 'lucide-react'
import styles from './Descarga.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function Descarga({ allSucursales = false }) {
  const { usuario, rol } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [seleccionadas, setSeleccionadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [descargando, setDescargando] = useState(false)
  const [preview, setPreview] = useState(null)

  const [tipoPeriodo, setTipoPeriodo] = useState('semana_actual')
  const [desde, setDesde] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

  const [incluirDetalle, setIncluirDetalle] = useState(true)
  const [incluirResumen, setIncluirResumen] = useState(true)
  const [incluirTicket, setIncluirTicket] = useState(true)

  useEffect(() => { loadSucursales() }, [usuario])

  async function loadSucursales() {
    setLoading(true)
    if (rol === 'gerente' || rol === 'suplente' || allSucursales) {
      const { data } = await supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      setSucursales(data ?? [])
      setSeleccionadas((data ?? []).map(s => s.id))
    } else {
      const { data } = await supabase.from('supervisor_sucursales')
        .select('sucursal_id, sucursales(id, nombre)').eq('supervisor_id', usuario.id)
      const sucs = data?.map(r => r.sucursales) ?? []
      setSucursales(sucs)
      setSeleccionadas(sucs.map(s => s.id))
    }
    setLoading(false)
  }

  function getFechas() {
    const hoy = new Date()
    switch (tipoPeriodo) {
      case 'semana_actual':
        return { desde: format(startOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'), hasta: format(hoy, 'yyyy-MM-dd') }
      case 'semana_pasada':
        return { desde: format(startOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'), hasta: format(endOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd') }
      case 'mes_actual':
        return { desde: format(startOfMonth(hoy), 'yyyy-MM-dd'), hasta: format(hoy, 'yyyy-MM-dd') }
      case 'mes_pasado':
        return { desde: format(startOfMonth(subMonths(hoy, 1)), 'yyyy-MM-dd'), hasta: format(endOfMonth(subMonths(hoy, 1)), 'yyyy-MM-dd') }
      case 'rango':
        return { desde, hasta }
      default:
        return { desde, hasta }
    }
  }

  function toggleSucursal(id) {
    setSeleccionadas(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  function toggleTodas() {
    setSeleccionadas(prev => prev.length === sucursales.length ? [] : sucursales.map(s => s.id))
  }

  async function cargarPreview() {
    if (seleccionadas.length === 0) return
    const { desde: d, hasta: h } = getFechas()
    const { data } = await supabase.from('ventas_diarias')
      .select('fecha, venta_total, pollos_vendidos, ticket_promedio, sucursal_id, sucursales(nombre)')
      .in('sucursal_id', seleccionadas)
      .gte('fecha', d).lte('fecha', h)
      .order('sucursal_id').order('fecha')
    setPreview(data ?? [])
  }

  async function descargar() {
    if (seleccionadas.length === 0) { alert('Selecciona al menos una sucursal'); return }
    setDescargando(true)
    const { desde: d, hasta: h } = getFechas()

    const [{ data: ventas }, { data: pollosTaco }] = await Promise.all([
      supabase.from('ventas_diarias')
        .select('fecha, venta_total, pollos_vendidos, ticket_promedio, sucursal_id, sucursales(nombre)')
        .in('sucursal_id', seleccionadas)
        .gte('fecha', d).lte('fecha', h)
        .order('sucursal_id').order('fecha'),
      supabase.from('pollos_taco')
        .select('id, sucursal_id, fecha_ingreso, cantidad, caducidad, sucursales(nombre)')
        .in('sucursal_id', seleccionadas)
        .order('sucursal_id').order('fecha_ingreso'),
    ])

    if (!ventas?.length && !pollosTaco?.length) {
      alert('Sin datos para el periodo seleccionado')
      setDescargando(false)
      return
    }

    const wb = XLSX.utils.book_new()
    const hoy = new Date()
    const generadoLabel = format(hoy, "d 'de' MMMM yyyy HH:mm", { locale: es })

    // Hoja 1: Detalle Diario
    if (incluirDetalle && ventas?.length) {
      const filas = []
      filas.push(['REVISIÓN DE RESULTADOS TUX — DETALLE DIARIO'])
      filas.push([`Periodo: ${d} al ${h}`])
      filas.push([`Generado: ${generadoLabel}`])
      filas.push([])

      const cols = ['Sucursal', 'Fecha', 'Día', 'Venta Total', 'Pollos Vendidos']
      if (incluirTicket) cols.push('Ticket Promedio')
      filas.push(cols)

      const porSucursal = {}
      ventas.forEach(r => {
        const nombre = r.sucursales?.nombre ?? r.sucursal_id
        if (!porSucursal[nombre]) porSucursal[nombre] = []
        porSucursal[nombre].push(r)
      })

      Object.entries(porSucursal).forEach(([nombre, rows]) => {
        rows.forEach(r => {
          const fila = [
            nombre,
            format(parseISO(r.fecha), 'dd/MM/yyyy'),
            format(parseISO(r.fecha), 'EEEE', { locale: es }),
            r.venta_total,
            parseFloat(r.pollos_vendidos),
          ]
          if (incluirTicket) fila.push(parseFloat(r.pollos_vendidos) > 0 ? parseFloat((r.venta_total / parseFloat(r.pollos_vendidos)).toFixed(2)) : 0)
          filas.push(fila)
        })
        const subtotalVenta = rows.reduce((a, r) => a + r.venta_total, 0)
        const subtotalPollos = rows.reduce((a, r) => a + parseFloat(r.pollos_vendidos), 0)
        const subtotalTicket = subtotalPollos > 0 ? subtotalVenta / subtotalPollos : 0
        const subtotalFila = [`Subtotal ${nombre}`, '', '', subtotalVenta, subtotalPollos]
        if (incluirTicket) subtotalFila.push(parseFloat(subtotalTicket.toFixed(2)))
        filas.push(subtotalFila)
        filas.push([])
      })

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Detalle Diario')
    }

    // Hoja 2: Resumen
    if (incluirResumen && ventas?.length) {
      const filas = []
      filas.push(['REVISIÓN DE RESULTADOS TUX — RESUMEN POR SUCURSAL'])
      filas.push([`Periodo: ${d} al ${h}`])
      filas.push([`Generado: ${generadoLabel}`])
      filas.push([])

      const colsRes = ['Sucursal', 'Días registrados', 'Venta Total', 'Pollos Totales']
      if (incluirTicket) colsRes.push('Ticket Promedio')
      colsRes.push('Promedio diario', 'Día más alto (fecha)', 'Venta más alta', 'Día más bajo (fecha)', 'Venta más baja')
      filas.push(colsRes)

      const porSucursal = {}
      ventas.forEach(r => {
        const nombre = r.sucursales?.nombre ?? r.sucursal_id
        if (!porSucursal[nombre]) porSucursal[nombre] = []
        porSucursal[nombre].push(r)
      })

      let grandTotalVenta = 0, grandTotalPollos = 0, grandTotalDias = 0

      Object.entries(porSucursal).forEach(([nombre, rows]) => {
        const totalVenta = rows.reduce((a, r) => a + r.venta_total, 0)
        const totalPollos = rows.reduce((a, r) => a + parseFloat(r.pollos_vendidos), 0)
        const ticket = totalPollos > 0 ? totalVenta / totalPollos : 0
        const promDia = totalVenta / rows.length
        grandTotalVenta += totalVenta
        grandTotalPollos += totalPollos
        grandTotalDias += rows.length

        const maxRow = rows.reduce((a, b) => a.venta_total > b.venta_total ? a : b)
        const minRow = rows.reduce((a, b) => a.venta_total < b.venta_total ? a : b)

        const fila = [nombre, rows.length, totalVenta, parseFloat(totalPollos.toFixed(1))]
        if (incluirTicket) fila.push(parseFloat(ticket.toFixed(2)))
        fila.push(
          parseFloat(promDia.toFixed(2)),
          format(parseISO(maxRow.fecha), 'dd/MM/yyyy EEEE', { locale: es }),
          maxRow.venta_total,
          format(parseISO(minRow.fecha), 'dd/MM/yyyy EEEE', { locale: es }),
          minRow.venta_total,
        )
        filas.push(fila)
      })

      filas.push([])
      const gtFila = ['TOTAL GENERAL', grandTotalDias, grandTotalVenta, parseFloat(grandTotalPollos.toFixed(1))]
      if (incluirTicket) gtFila.push(parseFloat((grandTotalPollos > 0 ? grandTotalVenta / grandTotalPollos : 0).toFixed(2)))
      gtFila.push(parseFloat((grandTotalVenta / (grandTotalDias || 1)).toFixed(2)), '', '', '', '')
      filas.push(gtFila)

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Resumen')
    }

    // Hoja 3: Pollo para Taco
    if (pollosTaco?.length) {
      const filas = []
      filas.push(['REVISIÓN DE RESULTADOS TUX — POLLO PARA TACO'])
      filas.push([`Generado: ${generadoLabel}`])
      filas.push([])
      filas.push(['Sucursal', 'Fecha ingreso', 'Cantidad', 'Caducidad', 'Días restantes', 'Estado'])

      const porSucTaco = {}

      pollosTaco.forEach(r => {
        const nombre = r.sucursales?.nombre ?? r.sucursal_id
        const caducidad = r.caducidad ? parseISO(r.caducidad) : null
        const diasRestantes = caducidad ? differenceInDays(caducidad, hoy) : null
        let estado = 'Sin fecha'
        if (diasRestantes !== null) {
          if (diasRestantes < 0) estado = 'Caducado'
          else if (diasRestantes === 0) estado = 'Último día'
          else if (diasRestantes <= 2) estado = 'Por caducar'
          else estado = 'Vigente'
        }

        filas.push([
          nombre,
          r.fecha_ingreso ? format(parseISO(r.fecha_ingreso), 'dd/MM/yyyy') : '',
          parseFloat(r.cantidad ?? 0),
          r.caducidad ? format(parseISO(r.caducidad), 'dd/MM/yyyy') : '',
          diasRestantes !== null ? diasRestantes : '',
          estado,
        ])

        if (!porSucTaco[nombre]) porSucTaco[nombre] = { vigente: 0, total: 0 }
        porSucTaco[nombre].total += parseFloat(r.cantidad ?? 0)
        if (estado === 'Vigente' || estado === 'Último día') {
          porSucTaco[nombre].vigente += parseFloat(r.cantidad ?? 0)
        }
      })

      filas.push([])
      filas.push(['STOCK VIGENTE POR SUCURSAL'])
      filas.push(['Sucursal', 'Stock vigente', 'Stock total (incl. caducados)'])
      Object.entries(porSucTaco).forEach(([nombre, v]) => {
        filas.push([nombre, v.vigente, v.total])
      })

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Pollo para Taco')
    }

    if (wb.SheetNames.length === 0) {
      alert('Sin datos para exportar')
      setDescargando(false)
      return
    }

    const periodoLabel = tipoPeriodo === 'rango' ? `${d}_${h}` : tipoPeriodo
    XLSX.writeFile(wb, `pechugon_ventas_${periodoLabel}.xlsx`)
    setDescargando(false)
  }

  const { desde: dPreview, hasta: hPreview } = getFechas()

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Exportar datos</h1>

      {/* Periodo */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Periodo</p>
        <div className={styles.periodoGrid}>
          {[
            { key: 'semana_actual', label: 'Esta semana' },
            { key: 'semana_pasada', label: 'Semana pasada' },
            { key: 'mes_actual', label: 'Este mes' },
            { key: 'mes_pasado', label: 'Mes pasado' },
            { key: 'rango', label: 'Rango libre' },
          ].map(p => (
            <button key={p.key}
              className={`${styles.periodoBtn} ${tipoPeriodo === p.key ? styles.periodoBtnActive : ''}`}
              onClick={() => setTipoPeriodo(p.key)}>
              {p.label}
            </button>
          ))}
        </div>

        {tipoPeriodo === 'rango' && (
          <div className={styles.rangoRow}>
            <div className={styles.rangoField}>
              <label className={styles.rangoLabel}>Desde</label>
              <input className={styles.rangoInput} type="date" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <span className={styles.rangoSep}>—</span>
            <div className={styles.rangoField}>
              <label className={styles.rangoLabel}>Hasta</label>
              <input className={styles.rangoInput} type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
        )}

        <div className={styles.periodoInfo}>
          <Calendar size={13} style={{ flexShrink: 0 }} />
          {dPreview} al {hPreview}
        </div>
      </div>

      {/* Sucursales */}
      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <p className={styles.sectionTitle}>Sucursales ({seleccionadas.length}/{sucursales.length})</p>
          <button className={styles.toggleTodasBtn} onClick={toggleTodas}>
            {seleccionadas.length === sucursales.length ? 'Quitar todas' : 'Seleccionar todas'}
          </button>
        </div>
        <div className={styles.sucursalesList}>
          {sucursales.map(s => (
            <div key={s.id}
              className={`${styles.sucItem} ${seleccionadas.includes(s.id) ? styles.sucItemActive : ''}`}
              onClick={() => toggleSucursal(s.id)}>
              <span className={styles.sucCheck}>
                {seleccionadas.includes(s.id) ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <span className={styles.sucNombre}>{s.nombre}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Opciones de contenido */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Contenido del archivo</p>
        <div className={styles.opcionesList}>
          {[
            { key: 'incluirDetalle', label: 'Detalle diario por sucursal', val: incluirDetalle, set: setIncluirDetalle },
            { key: 'incluirResumen', label: 'Resumen por sucursal', val: incluirResumen, set: setIncluirResumen },
            { key: 'incluirTicket', label: 'Incluir ticket promedio', val: incluirTicket, set: setIncluirTicket },
          ].map(o => (
            <div key={o.key} className={`${styles.opcionItem} ${o.val ? styles.opcionActive : ''}`}
              onClick={() => o.set(v => !v)}>
              <span className={styles.opcionCheck}>
                {o.val ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <span className={styles.opcionLabel}>{o.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className={styles.botonesRow}>
        <button className={styles.previewBtn} onClick={cargarPreview} disabled={seleccionadas.length === 0}>
          <Eye size={15} /> Vista previa
        </button>
        <button className={styles.descargaBtn} onClick={descargar} disabled={descargando || seleccionadas.length === 0}>
          {descargando ? 'Generando…' : <><Download size={15} /> Descargar Excel</>}
        </button>
      </div>

      {/* Vista previa */}
      {preview !== null && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Vista previa — {preview.length} registros</p>
          {preview.length === 0 ? (
            <p className={styles.sinDatos}>Sin datos para el periodo y sucursales seleccionadas</p>
          ) : (
            <div className={styles.previewTabla}>
              <div className={styles.previewHead}>
                <span>Sucursal</span><span>Fecha</span><span>Venta</span><span>Pollos</span><span>T.P.</span>
              </div>
              {preview.slice(0, 50).map((r, i) => (
                <div key={i} className={styles.previewRow}>
                  <span className={styles.ptSuc}>{r.sucursales?.nombre}</span>
                  <span className={styles.ptFecha}>{format(parseISO(r.fecha), 'd MMM', { locale: es })}</span>
                  <span className={styles.ptVenta}>{fmt(r.venta_total)}</span>
                  <span className={styles.ptPollos}>{fmtNum(r.pollos_vendidos)}</span>
                  <span className={styles.ptTicket}>{fmtDec(parseFloat(r.pollos_vendidos) > 0 ? r.venta_total / parseFloat(r.pollos_vendidos) : 0)}</span>
                </div>
              ))}
              {preview.length > 50 && <p className={styles.masRegistros}>… y {preview.length - 50} registros más en el archivo</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
