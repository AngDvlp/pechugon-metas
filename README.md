# Seguimiento de Metas El Pechugón — Guía de Despliegue

## Stack
- **Frontend:** React + Vite + PWA (Vercel)
- **Base de datos + Auth:** Supabase
- **Sin backend separado** — toda la lógica corre en Supabase (RLS + RPC)

---

## 1. Configurar Supabase

### 1.1 Crear proyecto
1. Ve a [supabase.com](https://supabase.com) → New Project
2. Elige un nombre (ej. `pechugon-metas`) y región (US East o la más cercana a México)
3. Guarda tu **Database Password**

### 1.2 Ejecutar el schema
1. Ve a **SQL Editor** en tu proyecto de Supabase
2. Copia y pega el contenido de `supabase_schema.sql`
3. Ejecuta con **Run**

### 1.3 Obtener credenciales
En **Project Settings → API**:
- `Project URL` → será tu `VITE_SUPABASE_URL`
- `anon public key` → será tu `VITE_SUPABASE_ANON_KEY`

---

## 2. Configurar el frontend

```bash
cd frontend
cp .env.example .env
```

Edita `.env`:
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

### Instalar y probar localmente
```bash
npm install
npm run dev
```

La app corre en `http://localhost:5173`

---

## 3. Crear el primer usuario (Gerente)

> **IMPORTANTE:** El primer gerente se crea manualmente en Supabase.

### Opción A — Desde Supabase Dashboard

1. Ve a **Authentication → Users → Add User**
2. Ingresa email y contraseña
3. Copia el UUID del usuario creado
4. Ve a **SQL Editor** y ejecuta:

```sql
-- Reemplaza los valores con los tuyos
INSERT INTO usuarios (id, nombre, email, rol_id)
VALUES (
  'UUID-DEL-USUARIO-AQUI',
  'Gerente General',
  'gerente@pechugon.com',
  (SELECT id FROM roles WHERE nombre = 'gerente')
);
```

5. Inicia sesión en la app con ese correo/contraseña
6. Desde la app, el gerente puede crear supervisores y encargados

---

## 4. Desplegar en Vercel

### 4.1 Conectar repositorio
1. Sube el proyecto a GitHub (solo necesitas subir la carpeta `frontend/`)
2. Ve a [vercel.com](https://vercel.com) → New Project → Import desde GitHub
3. Selecciona tu repositorio

### 4.2 Configurar build
Vercel detecta Vite automáticamente. Verifica:
- **Framework:** Vite
- **Root Directory:** `frontend` (si está en subcarpeta)
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### 4.3 Variables de entorno en Vercel
En **Settings → Environment Variables** agrega:
```
VITE_SUPABASE_URL     = https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJI...
```

### 4.4 Deploy
Click **Deploy** — en ~2 minutos tendrás tu URL pública.

---

## 5. Configurar dominio personalizado (opcional)
En Vercel → Settings → Domains → Add Domain

Agrega también el dominio en Supabase:
- **Authentication → URL Configuration → Site URL** → tu dominio
- **Redirect URLs** → `https://tudominio.com/**`

---

## 6. Flujo de uso

### El Gerente:
1. Crea sucursales en **Sucursales**
2. Crea encargados (asignándoles una sucursal) y supervisores en **Usuarios**
3. Asigna hasta 5 sucursales a cada supervisor desde la card del supervisor
4. Define metas por sucursal en **Metas** (monto + fecha inicio + fecha fin)

### El Encargado:
1. Inicia sesión y ve su dashboard directamente
2. Cada día al cerrar, registra **venta total** y **pollos vendidos**
3. El ticket promedio se calcula automáticamente
4. Ve el avance de su meta en tiempo real

### El Supervisor:
1. Ve sus 5 sucursales con % de avance, color de estado y venta de hoy
2. Toca cualquier sucursal para ver el detalle completo:
   - Gráfica de ventas diarias
   - Proyección al cierre del periodo
   - Tabla histórica con ticket promedio

---

## 7. Agregar o quitar sucursales

**Agregar:** Gerente → Sucursales → + Agregar  
**Desactivar:** Gerente → Sucursales → Desactivar (no elimina datos históricos)  
**Reasignar supervisor:** Gerente → Usuarios → card del supervisor → quitar/agregar sucursales

---

## 8. Seguridad (Row Level Security)

Todas las tablas tienen RLS activo:
- **Encargado:** solo puede insertar/editar ventas de su propia sucursal
- **Supervisor:** lectura de todos los datos, sin escritura
- **Gerente:** acceso completo de lectura y escritura

---

## 9. PWA — Instalación en móvil

### Android (Chrome):
1. Abre la URL en Chrome
2. Menú ⋮ → "Agregar a pantalla de inicio"

### iPhone (Safari):
1. Abre la URL en Safari
2. Botón de compartir → "Agregar a pantalla de inicio"

La app funciona offline para visualización de datos cacheados.

---

## 10. Estructura del proyecto

```
pechugon-metas/
├── supabase_schema.sql          # Schema completo con RLS y funciones
└── frontend/
    ├── public/                  # Assets estáticos
    ├── src/
    │   ├── components/          # Layout, Splash
    │   ├── contexts/            # AuthContext
    │   ├── lib/                 # Cliente Supabase
    │   └── pages/
    │       ├── Login.jsx
    │       ├── encargado/       # Dashboard encargado
    │       ├── supervisor/      # Dashboard + detalle sucursal
    │       └── gerente/         # Dashboard + Metas + Sucursales + Usuarios
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Soporte
Para agregar nuevas funcionalidades (ej. exportar a Excel, notificaciones push, comparativas entre periodos), el schema está diseñado para escalar sin cambios breaking.
