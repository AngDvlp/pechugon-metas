import { useState, useMemo } from 'react'
import {
  Brain, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Info, Zap,
  Target, Calendar
} from 'lucide-react'
import { calcularPredicciones } from '../lib/predictionEngine'
import styles from './PrediccionesPanel.module.css'

const fmt  = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtK = v => {
  if (!v) return '$0'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
  if (v >= 1000)    return `$${(v / 1000).toFixed(0)}k`
  return `$${Math.round(v)}`
}

const RECO_META = {
  peligro:  { Icon: AlertTriangle, color: 'var(--red)' },
  merma:    { Icon: AlertTriangle, color: 'var(--yellow)' },
  atencion: { Icon: Zap,           color: 'var(--yellow)' },
  exito:    { Icon: CheckCircle,   color: 'var(--success)' },
  info:     { Icon: Info,          color: 'var(--info)' },
}

export default function PrediccionesPanel({ historico, resumen, lotesTaco = [], hoyStr, titulo }) {
  const [expanded, setExpanded] = useState(false)

  const pred = useMemo(
    () => calcularPredicciones({ historico, resumen, lotesTaco, hoyStr }),
    [historico, resumen, lotesTaco, hoyStr]
  )

  const probColor = !pred?.metaResult ? 'var(--text-muted)'
    : pred.metaResult.probabilidad >= 70 ? 'var(--success)'
    : pred.metaResult.probabilidad >= 40 ? 'var(--yellow)'
    : 'var(--red)'

  const TendIcon = !pred ? Minus
    : pred.tendencia.direction === 'alza' ? TrendingUp
    : pred.tendencia.direction === 'baja' ? TrendingDown
    : Minus
  const tendColor = !pred ? 'var(--text-muted)'
    : pred.tendencia.direction === 'alza' ? 'var(--success)'
    : pred.tendencia.direction === 'baja' ? 'var(--red)'
    : 'var(--text-muted)'

  return (
    <div className={styles.panelCard}>
      {/* ── Header (siempre visible) ── */}
      <button className={styles.panelHeader} onClick={() => setExpanded(v => !v)}>
        <div className={styles.panelTitleRow}>
          <Brain size={14} strokeWidth={2} color="var(--info)" />
          <span className={styles.panelTitle}>{titulo ?? 'Predicciones ML'}</span>
          {pred?.metaResult && (
            <span className={styles.probBadge} style={{ background: probColor + '28', color: probColor }}>
              {pred.metaResult.probabilidad}% meta
            </span>
          )}
          {!pred && (
            <span className={styles.insufficientBadge}>Datos insuficientes</span>
          )}
        </div>
        <div className={styles.panelHeaderRight}>
          {pred && (
            <span className={styles.tendChip} style={{ color: tendColor }}>
              <TendIcon size={11} strokeWidth={2.5} />
              {pred.tendencia.direction}
            </span>
          )}
          {expanded
            ? <ChevronUp  size={14} strokeWidth={2} color="var(--text-muted)" />
            : <ChevronDown size={14} strokeWidth={2} color="var(--text-muted)" />}
        </div>
      </button>

      {expanded && (
        <div className={styles.panelBody}>
          {!pred ? (
            <p className={styles.noDataMsg}>
              Se necesitan al menos 5 días de ventas registradas para calcular predicciones.
            </p>
          ) : (
            <>
              {/* ── Probabilidad de meta ── */}
              {pred.metaResult && (
                <div className={styles.metaSection}>
                  <p className={styles.sectionLabel}>
                    <Target size={10} strokeWidth={2.5} />
                    Probabilidad de cumplir meta
                  </p>
                  <div className={styles.metaContent}>
                    <div className={styles.metaLeft}>
                      <span className={styles.metaProb} style={{ color: probColor }}>
                        {pred.metaResult.probabilidad}%
                      </span>
                      <div className={styles.metaProbBar}>
                        <div className={styles.metaProbFill}
                          style={{ width: `${pred.metaResult.probabilidad}%`, background: probColor }} />
                      </div>
                      <span className={styles.metaSubtitle}>
                        basado en {pred.totalVentasAnalizadas} días analizados
                      </span>
                    </div>
                    <div className={styles.metaStats}>
                      <div className={styles.metaStat}>
                        <span className={styles.metaStatLabel}>Acumulado</span>
                        <span className={styles.metaStatVal}>{fmt(pred.metaResult.acumulado)}</span>
                      </div>
                      <div className={styles.metaStat}>
                        <span className={styles.metaStatLabel}>Meta</span>
                        <span className={styles.metaStatVal}>{fmt(pred.metaResult.meta)}</span>
                      </div>
                      <div className={styles.metaStat}>
                        <span className={styles.metaStatLabel}>Proyección</span>
                        <span className={styles.metaStatVal} style={{
                          color: pred.metaResult.proyeccion >= pred.metaResult.meta ? 'var(--success)' : 'var(--red)'
                        }}>
                          {fmt(pred.metaResult.proyeccion)}
                        </span>
                      </div>
                      <div className={styles.metaStat}>
                        <span className={styles.metaStatLabel}>Días rest.</span>
                        <span className={styles.metaStatVal}>{pred.metaResult.diasRestantes}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.divider} />

              {/* ── Pronóstico 7 días ── */}
              <div className={styles.forecastSection}>
                <p className={styles.sectionLabel}>
                  <Calendar size={10} strokeWidth={2.5} />
                  Pronóstico próximos 7 días
                </p>
                <div className={styles.forecastScroll}>
                  {pred.proximosDias.map(dia => (
                    <div key={dia.fecha}
                      className={`${styles.diaCard} ${dia.esMejor ? styles.diaCardBest : ''}`}>
                      <span className={styles.diaNombre}>{dia.nombre}</span>
                      <span className={styles.diaVal}
                        style={{ color: dia.esMejor ? 'var(--success)' : 'var(--text-primary)' }}>
                        {fmtK(dia.estimado)}
                      </span>
                      <div className={styles.diaBarWrap}>
                        <div className={styles.diaBar}
                          style={{
                            height: `${Math.round(dia.esBestPct * 100)}%`,
                            background: dia.esMejor ? 'var(--success)' : 'var(--info)',
                          }} />
                      </div>
                      <span className={styles.diaRange}>±{fmtK(dia.high - dia.estimado)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.divider} />

              {/* ── Mejor / peor día histórico ── */}
              {(pred.mejorDia || pred.peorDia) && (
                <div className={styles.daysSection}>
                  <p className={styles.sectionLabel}>Rendimiento histórico por día</p>
                  <div className={styles.daysGrid}>
                    {pred.mejorDia && (
                      <div className={styles.dayCard} style={{ borderColor: 'var(--success)28' }}>
                        <span className={styles.dayCardLabel}>Mejor día</span>
                        <span className={styles.dayCardName} style={{ color: 'var(--success)' }}>
                          {pred.mejorDia.nombre}
                        </span>
                        <span className={styles.dayCardVal}>{fmt(pred.mejorDia.avg)}</span>
                        <span className={styles.dayCardCount}>{pred.mejorDia.count} registros</span>
                      </div>
                    )}
                    {pred.peorDia && pred.peorDia.dow !== pred.mejorDia?.dow && (
                      <div className={styles.dayCard} style={{ borderColor: 'var(--border)' }}>
                        <span className={styles.dayCardLabel}>Menor venta</span>
                        <span className={styles.dayCardName} style={{ color: 'var(--text-muted)' }}>
                          {pred.peorDia.nombre}
                        </span>
                        <span className={styles.dayCardVal}>{fmt(pred.peorDia.avg)}</span>
                        <span className={styles.dayCardCount}>{pred.peorDia.count} registros</span>
                      </div>
                    )}
                    <div className={styles.dayCard} style={{ borderColor: 'var(--info)28' }}>
                      <span className={styles.dayCardLabel}>Tendencia</span>
                      <span className={styles.dayCardName} style={{ color: tendColor }}>
                        {pred.tendencia.direction}
                      </span>
                      <span className={styles.dayCardVal} style={{ color: tendColor }}>
                        {pred.tendencia.slope > 0 ? '+' : ''}{fmt(pred.tendencia.slope)}/día
                      </span>
                      <span className={styles.dayCardCount}>últimas 4 semanas</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Riesgo de merma (solo si hay lotes de taco) ── */}
              {lotesTaco.length > 0 && (
                <>
                  <div className={styles.divider} />
                  <div className={styles.mermaSection}>
                    <div className={styles.mermaHeaderRow}>
                      <p className={styles.sectionLabel}>Riesgo de merma — Pollo para Taco</p>
                      <span className={styles.mermaBadge} style={{
                        background: pred.nivelMerma === 'alto' ? 'var(--red)28'
                          : pred.nivelMerma === 'medio' ? 'var(--yellow)28' : 'var(--success)28',
                        color: pred.nivelMerma === 'alto' ? 'var(--red)'
                          : pred.nivelMerma === 'medio' ? 'var(--yellow)' : 'var(--success)',
                      }}>
                        {pred.nivelMerma.toUpperCase()}
                      </span>
                    </div>
                    <div className={styles.mermaStats}>
                      <div className={styles.mermaStat}>
                        <span className={styles.mermaStatLabel}>Stock vigente</span>
                        <span className={styles.mermaStatVal}>{pred.stockTaco} pollos</span>
                      </div>
                      <div className={styles.mermaStatDiv} />
                      <div className={styles.mermaStat}>
                        <span className={styles.mermaStatLabel}>Consumo estimado</span>
                        <span className={styles.mermaStatVal}>{pred.consumoEstimado} pollos</span>
                      </div>
                      {pred.diasHastaVenc !== Infinity && (
                        <>
                          <div className={styles.mermaStatDiv} />
                          <div className={styles.mermaStat}>
                            <span className={styles.mermaStatLabel}>Próx. caducidad</span>
                            <span className={styles.mermaStatVal}
                              style={{ color: pred.diasHastaVenc <= 1 ? 'var(--red)' : pred.diasHastaVenc <= 2 ? 'var(--yellow)' : 'var(--text-primary)' }}>
                              {pred.diasHastaVenc === 0 ? 'Hoy' : pred.diasHastaVenc === 1 ? 'Mañana' : `${pred.diasHastaVenc} días`}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className={styles.divider} />

              {/* ── Recomendaciones ── */}
              {pred.recomendaciones.length > 0 && (
                <div className={styles.recoSection}>
                  <p className={styles.sectionLabel}>Recomendaciones</p>
                  {pred.recomendaciones.map((r, i) => {
                    const meta = RECO_META[r.tipo] ?? RECO_META.info
                    return (
                      <div key={i} className={styles.recoItem}
                        style={{ borderLeftColor: meta.color }}>
                        <meta.Icon size={13} strokeWidth={2} color={meta.color}
                          style={{ flexShrink: 0, marginTop: 1 }} />
                        <span className={styles.recoTexto}>{r.texto}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
