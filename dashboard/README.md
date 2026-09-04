# Panel de Sable Barber Studio (Next.js)

Panel SaaS multi-tenant para barberías. Server Components + Server Actions, Prisma
sobre PostgreSQL (Supabase en producción). El bot de WhatsApp vive fuera de este
proyecto (raíz del repo) y corre en un VPS aparte — ver la sección de despliegue.

## Desarrollo local

```bash
npm install                 # desde la raíz del repo (es un workspace de npm)
cp dashboard/.env.example dashboard/.env.local   # y llena los valores
npx prisma migrate dev --name init_postgres      # una sola vez, con Postgres real
npm run dashboard:dev       # o: npm run dev --workspace dashboard
```

Abre [http://localhost:3001](http://localhost:3001).

## Despliegue en producción

### 1. Supabase (base de datos)

1. Crea un proyecto en Supabase.
2. Copia dos cadenas de conexión de Project Settings > Database: la **pooled** (puerto
   6543, `?pgbouncer=true`) para `DATABASE_URL`, y la **directa** (puerto 5432) para
   `DIRECT_URL`.
3. Desde tu máquina, con esas variables en `dashboard/.env.local`:
   ```bash
   npx prisma migrate deploy --schema=../prisma/schema.prisma
   npm run db:seed --workspace .   # opcional, solo si quieres los datos de ejemplo
   ```
   (si es la primera vez que corres esto contra Postgres, usa antes `prisma migrate dev
   --name init_postgres` para generar el historial — ver `prisma/migrations/README.md`).
4. Backups: Supabase hace backups diarios automáticos en los planes de pago (Point-in-
   Time Recovery en Pro+). Actívalo desde Database > Backups. Git **no** es un backup de
   la base de datos — solo del código.

### 2. Vercel (panel)

1. Importa el repo en Vercel. **Root Directory: `dashboard`**, con "Include files
   outside of the Root Directory in the Build Step" activado (el `prisma/schema.prisma`
   vive un nivel arriba).
2. Framework preset: Next.js (autodetectado).
3. Variables de entorno (Production **y** Preview) — ver `dashboard/.env.example` para
   la lista completa: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `META_VERIFY_TOKEN`,
   `CRON_SECRET`, `BILLING_GRACE_DAYS`, `NEXT_PUBLIC_APP_URL`, `FIREBASE_SERVICE_ACCOUNT`
   (opcional).
4. Deploy. El cron de `vercel.json` (`/api/cron/tenant-billing`, diario) se activa solo.

### 3. VPS / Oracle Cloud (bot de WhatsApp — PM2)

El bot **no** va en Vercel (necesita un proceso persistente). Desde la raíz del repo en
el VPS:

```bash
npm install
cp .env.example .env   # DATABASE_URL (mismo Supabase), META_VERIFY_TOKEN, ROUTER_PORT
pm2 start ecosystem.config.cjs
pm2 save
```

`ecosystem.config.cjs` levanta `webhook-router.js` (única URL pública para Meta) y un
proceso `whatsapp-meta-bot.js` por barbería ya vinculada a la Cloud API. Para dar de
alta una barbería nueva, agrega otra entrada en ese archivo con su propio
`METATENANT_SLUG` y corre `pm2 reload ecosystem.config.cjs`.

En el panel de Meta (developers.facebook.com), la URL de webhook apunta al puerto
público de `webhook-router.js` (detrás de tu proxy/dominio del VPS), con el mismo
`META_VERIFY_TOKEN` de ambos `.env`.

### 4. Android (Capacitor)

1. Antes de compilar, reemplaza `server.url` en `dashboard/capacitor.config.json` por
   tu dominio real de Vercel.
2. Desde `dashboard/`:
   ```bash
   npx cap sync android
   cd android
   ./gradlew bundleRelease   # genera el .aab para subir a Play Console
   # o ./gradlew assembleRelease para un .apk de prueba
   ```
3. Un solo APK/AAB sirve para todas las barberías: el tenant se determina por la sesión
   (login con slug + usuario + contraseña), no por el build.
