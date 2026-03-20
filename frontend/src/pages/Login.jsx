import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './Login.module.css'

export default function Login() {
  const { signIn, rol } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await signIn(email.trim(), password)

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }
    // Redirect based on role — AuthContext will update, App router handles navigation
    setLoading(false)
    navigate('/', { replace: true })
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden />

      <div className={styles.card}>
        <div className={styles.logoArea}>
          <div className={styles.logoMark}>
            <span>P</span>
          </div>
          <h1 className={styles.appName}>El Pechugón</h1>
          <p className={styles.tagline}>Seguimiento de Metas</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              placeholder="nombre@pechugon.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Contraseña</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className={styles.errorBanner}>
              <span>⚠</span> {error}
            </div>
          )}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? <span className={styles.spinner} /> : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>Acceso exclusivo para personal autorizado</p>
      </div>
    </div>
  )
}
