# Billetera Demo (Ops Console)

Interfaz Next.js para probar el backend: **Inicio**, **Tutorial** y **Pruebas de estrés**.

## Desarrollo local

```bash
cd ops-console
cp .env.example .env.local
npm install
npm run dev
```

Abre http://localhost:3001

## Despliegue en Vercel

### 1. Conectar el repositorio

1. [vercel.com/new](https://vercel.com/new) → importa el repo de GitHub.
2. **Root Directory:** `ops-console` (si el repo es la carpeta `wallet-ledger-service`, usa `wallet-ledger-service/ops-console`).
3. Framework: **Next.js** (detectado automáticamente vía `vercel.json`).

### 2. Variable de entorno (obligatoria)

En **Project → Settings → Environment Variables**:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `https://wallet-ledger-service-production.up.railway.app` |

Aplícala a **Production**, **Preview** y **Development**. Vuelve a desplegar después de guardar.

### 3. CORS en Railway (backend)

En el servicio API, agrega la URL de Vercel a `CORS_ORIGINS`:

```env
CORS_ORIGINS=https://tu-proyecto.vercel.app,http://localhost:3001
```

Sin barra final. Redeploy del API.

### 4. Deploy

Push a `main`/`develop` o **Deploy** manual en Vercel. Cada push al directorio `ops-console` puede disparar un preview si configuraste el root correcto.

### CLI (opcional)

```bash
cd ops-console
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel --prod
```

## Rutas

| Ruta | Uso |
|------|-----|
| `/` | Dashboard y estado del servidor |
| `/tutorial` | Flujo guiado |
| `/stress` | Pruebas de concurrencia |

## Crédito

Prueba hecha por **Jonathan Pernía**.
