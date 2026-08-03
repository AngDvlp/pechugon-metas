import styles from './PageSkeleton.module.css'

function Bone({ w = '100%', h = 14, r = 6 }) {
  return <div className={styles.bone} style={{ width: w, height: h, borderRadius: r }} />
}

const ROW_WIDTHS = ['62%', '76%', '54%', '70%', '58%']

export default function PageSkeleton({ hasChart = false, rows = 4 }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <Bone w="52%" h={18} r={8} />
        <div style={{ marginTop: 8 }}><Bone w="108px" h={11} /></div>
      </div>

      <div className={styles.kpiRow}>
        {[0, 1, 2].map(i => (
          <div key={i} className={styles.kpiCard}>
            <Bone w="44px" h={26} r={8} />
            <div style={{ marginTop: 8 }}><Bone w="60px" h={10} /></div>
          </div>
        ))}
      </div>

      {hasChart && (
        <div style={{ marginTop: 2 }}>
          <Bone w="100%" h={180} r={12} />
        </div>
      )}

      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.listRow}>
          <div className={styles.listLeft}>
            <Bone w={ROW_WIDTHS[i % ROW_WIDTHS.length]} h={14} />
            <Bone w="56px" h={10} />
          </div>
          <Bone w="40px" h={20} r={8} />
        </div>
      ))}
    </div>
  )
}
