/**
 * Motor de Predicciones ML — El Pechugón
 * Algoritmos: Holt's Exponential Smoothing + Regresión Lineal + Estacionalidad por día + Monte Carlo
 */

const DIAS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function parseDate(str) {
  return new Date(str + 'T00:00:00')
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function stddev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length)
}

// OLS regresión lineal: y = slope*x + intercept
function linearRegression(values) {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 }
  const xMean = (n - 1) / 2
  const yMean = mean(values)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  return { slope, intercept: yMean - slope * xMean }
}

// Holt's double exponential smoothing (nivel + tendencia)
function holtsSmoothing(values, alpha = 0.35, beta = 0.1) {
  if (values.length === 0) return { level: 0, trend: 0 }
  let level = values[0]
  let trend = values.length > 1
    ? (values[Math.min(3, values.length - 1)] - values[0]) / Math.min(3, values.length - 1)
    : 0

  for (let i = 1; i < values.length; i++) {
    const prevLevel = level
    level = alpha * values[i] + (1 - alpha) * (level + trend)
    trend = beta * (level - prevLevel) + (1 - beta) * trend
  }
  return { level, trend }
}

// Índices de estacionalidad por día de semana
function calcSeasonality(ventas) {
  const sums   = Array(7).fill(0)
  const counts = Array(7).fill(0)

  ventas.forEach(v => {
    const dow = parseDate(v.fecha).getDay()
    sums[dow]   += v.venta_total
    counts[dow] += 1
  })

  const avgs = sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0)
  const active = avgs.filter(a => a > 0)
  const overallAvg = active.length > 0 ? mean(active) : 1
  const indices = avgs.map(a => overallAvg > 0 && a > 0 ? a / overallAvg : 1)

  return { avgs, indices, counts }
}

// Generador normal (Box-Muller)
function randNorm() {
  const u1 = Math.random() || 1e-10
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// Simulación Monte Carlo para probabilidad de cumplir la meta
function monteCarloProbability({ acumulado, meta, diasRestantes, baseLevel, trend, sigma, seasonality, hoy }) {
  if (diasRestantes <= 0) return { probabilidad: acumulado >= meta ? 100 : 0, proyeccion: acumulado }

  const N = 4000
  let cumple = 0
  let totalSum = 0

  for (let sim = 0; sim < N; sim++) {
    let simTotal = acumulado
    for (let d = 0; d < diasRestantes; d++) {
      const futureDate = new Date(hoy)
      futureDate.setDate(hoy.getDate() + d + 1)
      const dow    = futureDate.getDay()
      const factor = seasonality.indices[dow] || 1
      const base   = Math.max(0, baseLevel + trend * (d + 1))
      const noise  = randNorm() * sigma
      simTotal    += Math.max(0, base * factor + noise)
    }
    if (simTotal >= meta) cumple++
    totalSum += simTotal
  }

  return {
    probabilidad: Math.round((cumple / N) * 100),
    proyeccion:   Math.round(totalSum / N),
  }
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────
export function calcularPredicciones({ historico, resumen, lotesTaco = [], hoyStr }) {
  const hoy = parseDate(hoyStr ?? new Date().toISOString().slice(0, 10))

  // Filtrar y ordenar
  const ventas = (historico ?? [])
    .filter(v => v.venta_total > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  if (ventas.length < 5) return null

  const valores = ventas.map(v => v.venta_total)

  // ── Estacionalidad ──
  const seasonality = calcSeasonality(ventas)

  // ── Tendencia (hasta 28 días recientes) ──
  const recentForTrend = valores.slice(-28)
  const lr = linearRegression(recentForTrend)

  // ── Suavizado exponencial de Holt ──
  const holts = holtsSmoothing(valores)

  // Tendencia combinada: OLS 40% + Holt 60%
  const blendedTrend = lr.slope * 0.4 + holts.trend * 0.6
  const baseLevel    = holts.level

  // ── Sigma (volatilidad reciente) ──
  const last14 = valores.slice(-14)
  const sigma  = stddev(last14) * 0.8

  // ── Pronóstico 7 días ──
  const maxVal = Math.max(...valores)
  const proximosDias = []
  for (let i = 1; i <= 7; i++) {
    const dia = new Date(hoy)
    dia.setDate(hoy.getDate() + i)
    const dow      = dia.getDay()
    const factor   = seasonality.indices[dow] || 1
    const raw      = Math.max(0, baseLevel + blendedTrend * i)
    const estimado = Math.round(raw * factor)
    const rango    = Math.round(sigma * factor)

    proximosDias.push({
      fecha:    dia.toISOString().slice(0, 10),
      dow,
      nombre:   DIAS_ES[dow],
      estimado,
      low:      Math.max(0, estimado - rango),
      high:     estimado + rango,
      factor,
      esBestPct: maxVal > 0 ? (estimado / maxVal) : 0,
    })
  }

  // Marcar el mejor día del pronóstico
  const maxEst = Math.max(...proximosDias.map(d => d.estimado))
  proximosDias.forEach(d => { d.esMejor = d.estimado === maxEst })

  // ── Probabilidad de meta (Monte Carlo) ──
  let metaResult = null
  if (resumen) {
    const metaVal       = resumen.meta_venta ?? resumen.meta_mensual ?? 0
    const acumulado     = resumen.venta_acumulada ?? 0
    const diasTotales   = resumen.dias_totales ?? 30
    const diasTransc    = resumen.dias_transcurridos ?? 0
    const diasRestantes = Math.max(0, diasTotales - diasTransc)

    if (metaVal > 0) {
      const mc = monteCarloProbability({
        acumulado, meta: metaVal, diasRestantes,
        baseLevel, trend: blendedTrend, sigma,
        seasonality, hoy,
      })
      metaResult = {
        ...mc,
        meta:            metaVal,
        acumulado,
        diasRestantes,
        diasTranscurridos: diasTransc,
        diasTotales,
        avancePct: metaVal > 0 ? Math.round((acumulado / metaVal) * 100) : 0,
        faltante:  Math.max(0, metaVal - acumulado),
      }
    }
  }

  // ── Riesgo de merma (pollos para taco) ──
  const hoyStrLocal    = hoy.toISOString().slice(0, 10)
  const lotesVigentes  = lotesTaco.filter(l => l.fecha_caducidad > hoyStrLocal)
  const stockTaco      = lotesVigentes.reduce((a, l) => a + l.cantidad, 0)

  const ventasConPollos  = ventas.filter(v => v.pollos_vendidos > 0).slice(-21)
  const avgPollosDia     = ventasConPollos.length > 0
    ? mean(ventasConPollos.map(v => v.pollos_vendidos)) : 0

  const lotesOrdenados   = [...lotesVigentes].sort((a, b) => a.fecha_caducidad.localeCompare(b.fecha_caducidad))
  const primerVenc       = lotesOrdenados[0]
  const diasHastaVenc    = primerVenc
    ? Math.max(0, Math.round((parseDate(primerVenc.fecha_caducidad) - hoy) / 86400000))
    : Infinity

  const ventana          = Math.min(diasHastaVenc + 1, 3)
  const consumoEstimado  = Math.round(avgPollosDia * ventana)
  const exceso           = stockTaco - consumoEstimado

  let nivelMerma = 'bajo'
  if (lotesTaco.length > 0 && stockTaco > 0) {
    if (exceso > avgPollosDia * 2)        nivelMerma = 'alto'
    else if (exceso > avgPollosDia * 0.5) nivelMerma = 'medio'
  }

  // ── Mejor y peor día histórico ──
  const diasStats = seasonality.avgs
    .map((avg, i) => ({ dow: i, nombre: DIAS_ES[i], avg, count: seasonality.counts[i] }))
    .filter(d => d.count >= 2)
    .sort((a, b) => b.avg - a.avg)
  const mejorDia = diasStats[0] ?? null
  const peorDia  = diasStats[diasStats.length - 1] ?? null

  // ── Ticket promedio reciente ──
  const last7withPollos = ventas.slice(-7).filter(v => v.pollos_vendidos > 0)
  const ticketProm      = last7withPollos.length > 0
    ? mean(last7withPollos.map(v => v.venta_total / v.pollos_vendidos)) : 0

  // ── Recomendaciones ──
  const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
  const recomendaciones = []

  if (metaResult) {
    if (metaResult.probabilidad < 30 && metaResult.diasRestantes > 0) {
      const necesarioDia = metaResult.faltante / metaResult.diasRestantes
      recomendaciones.push({
        tipo: 'peligro',
        texto: `Necesitas ${fmt(necesarioDia)}/día para alcanzar la meta (${metaResult.diasRestantes} días restantes)`,
      })
    } else if (metaResult.probabilidad >= 80) {
      recomendaciones.push({ tipo: 'exito', texto: 'Vas muy bien encaminado, alta probabilidad de superar la meta del período' })
    } else if (metaResult.probabilidad >= 50) {
      recomendaciones.push({ tipo: 'atencion', texto: 'Probabilidad moderada — mantén el ritmo y busca impulsar ventas en días clave' })
    } else {
      recomendaciones.push({ tipo: 'atencion', texto: `Proyección de cierre: ${fmt(metaResult.proyeccion)} — refuerza la estrategia esta semana` })
    }
  }

  if (nivelMerma === 'alto') {
    recomendaciones.push({
      tipo: 'merma',
      texto: `Exceso de pollo para taco: ${stockTaco} pollos vs. consumo estimado ${consumoEstimado}. Reduce el siguiente pedido`,
    })
  } else if (nivelMerma === 'medio') {
    recomendaciones.push({
      tipo: 'atencion',
      texto: `Stock de taco ligeramente alto: ${stockTaco} pollos. Monitorea el ritmo de venta`,
    })
  }

  if (lr.slope > 80) {
    recomendaciones.push({ tipo: 'info', texto: `Tendencia al alza +${fmt(lr.slope)}/día — aprovecha el impulso con promociones` })
  } else if (lr.slope < -80) {
    recomendaciones.push({ tipo: 'atencion', texto: `Tendencia a la baja ${fmt(lr.slope)}/día — revisa estrategia de ventas y precios` })
  }

  if (mejorDia) {
    recomendaciones.push({ tipo: 'info', texto: `Mejor día histórico: ${mejorDia.nombre} (promedio ${fmt(mejorDia.avg)}) — prioriza stock y personal ese día` })
  }

  return {
    proximosDias,
    metaResult,
    nivelMerma,
    stockTaco,
    consumoEstimado,
    diasHastaVenc,
    mejorDia,
    peorDia,
    tendencia: {
      slope:     lr.slope,
      direction: lr.slope > 30 ? 'alza' : lr.slope < -30 ? 'baja' : 'estable',
    },
    recomendaciones,
    ticketProm,
    baseLevel,
    totalVentasAnalizadas: ventas.length,
  }
}
