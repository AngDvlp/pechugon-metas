// ML prediction engine — uses historical ventas_diarias data
// Algorithms: linear regression, weighted moving average, day-of-week seasonality, Monte Carlo

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)

function dowOf(fechaStr) {
  return new Date(fechaStr + 'T00:00:00').getDay()
}

function linearSlope(values) {
  const n = values.length
  if (n < 3) return 0
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  const num = values.reduce((acc, y, i) => acc + (i - xMean) * (y - yMean), 0)
  const den = values.reduce((acc, _, i) => acc + (i - xMean) ** 2, 0)
  return den > 0 ? num / den : 0
}

function computeDowAvgs(historial) {
  const groups = Array(7).fill(null).map(() => [])
  historial.forEach(v => {
    if (v.venta_total > 0) groups[dowOf(v.fecha)].push(v.venta_total)
  })
  return groups.map(vals => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
}

function weightedMean(values) {
  if (!values.length) return 0
  let wSum = 0, vSum = 0
  values.forEach((v, i) => {
    const w = Math.exp((i - values.length + 1) * 0.15)
    vSum += v * w
    wSum += w
  })
  return wSum > 0 ? vSum / wSum : 0
}

function randNormal(mean, std) {
  const u1 = Math.random(), u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
  return mean + z * std
}

// historial: [{fecha, venta_total, pollos_vendidos, tacos_producidos, tacos_vendidos}]
// params: { meta, acumulado, diasRestantes }
export function calcularPrediccion(historial, { meta = 0, acumulado = 0, diasRestantes = 0 }) {
  const validos = historial.filter(v => v.venta_total > 0)
  if (validos.length < 5) return null

  const ventas = validos.map(v => v.venta_total)
  const mean = ventas.reduce((a, b) => a + b, 0) / ventas.length
  const variance = ventas.reduce((acc, v) => acc + (v - mean) ** 2, 0) / ventas.length
  const std = Math.sqrt(variance)

  // Day-of-week seasonality
  const dowAvgs = computeDowAvgs(validos)
  const validDow = dowAvgs.filter(v => v !== null)
  const overallAvg = validDow.length ? validDow.reduce((a, b) => a + b, 0) / validDow.length : mean
  const dowSeason = dowAvgs.map(v => (v !== null && overallAvg > 0) ? v / overallAvg : 1)

  // Best/worst days
  const dowRanked = dowAvgs.map((v, i) => ({ v, i })).filter(d => d.v !== null)
  const bestDow = dowRanked.length ? [...dowRanked].sort((a, b) => b.v - a.v)[0] : null
  const worstDow = dowRanked.length ? [...dowRanked].sort((a, b) => a.v - b.v)[0] : null

  // Trend from last 14 days
  const recentVentas = ventas.slice(-14)
  const trendSlope = linearSlope(recentVentas)
  const trendPct = mean > 0 ? trendSlope / mean : 0

  // Exponentially weighted mean
  const wma = weightedMean(ventas)

  // Project remaining days with DoW seasonality + trend
  const today = new Date()
  let proyeccion = acumulado
  const days = Math.max(0, diasRestantes)
  for (let d = 0; d < days; d++) {
    const future = new Date(today)
    future.setDate(today.getDate() + d + 1)
    const dow = future.getDay()
    const season = dowSeason[dow] || 1
    const trend = Math.max(0.5, Math.min(2.0, 1 + trendPct * (d + 1)))
    proyeccion += wma * season * trend
  }

  // Confidence band (±1σ adjusted for remaining days)
  const sqrtDays = Math.sqrt(days)
  const proyBaja = proyeccion - std * sqrtDays * 0.45
  const proyAlta = proyeccion + std * sqrtDays * 0.45

  // Monte Carlo probability of hitting meta
  let probMeta = meta > 0 && acumulado >= meta ? 1 : 0
  if (meta > 0 && days > 0 && acumulado < meta) {
    const N = 1500
    let hits = 0
    for (let sim = 0; sim < N; sim++) {
      let total = acumulado
      for (let d = 0; d < days; d++) {
        const future = new Date(today)
        future.setDate(today.getDate() + d + 1)
        const season = dowSeason[future.getDay()] || 1
        total += Math.max(0, randNormal(wma * season, std * 0.65))
      }
      if (total >= meta) hits++
    }
    probMeta = hits / N
  }

  // Tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowPred = wma * (dowSeason[tomorrow.getDay()] || 1)

  // Merma (waste rate)
  const conTacos = validos.filter(v => v.tacos_producidos > 0)
  const mermaRate = conTacos.length
    ? conTacos.reduce((acc, v) => acc + (v.tacos_producidos - (v.tacos_vendidos || 0)) / v.tacos_producidos, 0) / conTacos.length
    : null

  // Ticket potential
  const tickets = validos
    .filter(v => parseFloat(v.pollos_vendidos) > 0)
    .map(v => v.venta_total / parseFloat(v.pollos_vendidos))
  const avgTicket = tickets.length ? tickets.reduce((a, b) => a + b, 0) / tickets.length : null
  const maxTicket = tickets.length ? Math.max(...tickets) : null
  const ticketGap = avgTicket && maxTicket ? ((maxTicket / avgTicket) - 1) * 100 : null

  // Trend label
  const tendencia = trendPct > 0.025 ? 'subiendo' : trendPct < -0.025 ? 'bajando' : 'estable'

  // Recommendations
  const recs = []
  if (probMeta < 0.35 && days > 0 && meta > 0) {
    const need = Math.max(0, meta - acumulado)
    recs.push({ tipo: 'urgente', texto: `Necesitas ${fmt(need / days)}/día para alcanzar la meta` })
  }
  if (mermaRate !== null && mermaRate > 0.15) {
    recs.push({ tipo: 'merma', texto: `Merma de tacos al ${(mermaRate * 100).toFixed(0)}% — reducirla al 10% mejora ingresos` })
  }
  if (ticketGap !== null && ticketGap > 12) {
    recs.push({ tipo: 'ticket', texto: `Potencial de ticket: tu mejor día fue ${ticketGap.toFixed(0)}% sobre el promedio` })
  }
  if (tendencia === 'bajando' && days > 5) {
    recs.push({ tipo: 'tendencia', texto: 'Ventas en tendencia descendente — revisa precios o promociones' })
  }
  if (bestDow && validDow.length >= 3) {
    recs.push({ tipo: 'dia', texto: `Mejor día histórico: ${DOW_LABELS[bestDow.i]} — enfoca esfuerzos ese día` })
  }

  return {
    proyeccion: Math.max(0, proyeccion),
    proyBaja: Math.max(0, proyBaja),
    proyAlta: Math.max(0, proyAlta),
    probMeta: Math.min(1, Math.max(0, probMeta)),
    tomorrowPred: Math.max(0, tomorrowPred),
    tomorrowDow: tomorrow.getDay(),
    tendencia,
    trendPct,
    mermaRate,
    avgTicket,
    maxTicket,
    ticketGap,
    bestDow: bestDow ? { dow: bestDow.i, label: DOW_LABELS[bestDow.i], avg: bestDow.v } : null,
    worstDow: worstDow ? { dow: worstDow.i, label: DOW_LABELS[worstDow.i], avg: worstDow.v } : null,
    dowAvgs,
    wma,
    mean,
    std,
    dataPoints: validos.length,
    recs,
  }
}
