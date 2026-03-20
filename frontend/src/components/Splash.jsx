import styles from './Splash.module.css'

export default function Splash() {
  return (
    <div className={styles.splash}>
      <div className={styles.logo}>
        <span className={styles.brand}>El Pechugón</span>
        <span className={styles.sub}>Seguimiento de Metas</span>
      </div>
      <div className={styles.loader}>
        <div className={styles.bar} />
      </div>
    </div>
  )
}
