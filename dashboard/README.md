# Panel de Sable Barber Studio (Next.js)

Panel SaaS multi-tenant para barberías. Server Components + Server Actions, Prisma
sobre PostgreSQL (Supabase en producción). El bot de WhatsApp (API oficial de Meta)
también corre aquí mismo, como parte de este proyecto — sin VPS, sin proceso aparte.

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
4. Deploy. Los crons de `vercel.json` se activan solos.

### 3. WhatsApp (Meta Cloud API — corre en el mismo Vercel, sin VPS)

El bot vive en `dashboard/lib/whatsapp-flow.js` + `dashboard/app/api/whatsapp/webhook`,
como una función serverless más de este proyecto — no hay proceso que mantener prendido
en ningún lado, ni IP fija, ni PM2. El progreso de cada conversación se guarda en la
tabla `ConversationState` (Postgres), no en memoria.

**Configuración en el panel de Meta** (developers.facebook.com → tu App → WhatsApp →
Configuración → Webhooks):
- **Callback URL**: `https://<tu-dominio>.vercel.app/api/whatsapp/webhook`
- **Verify token**: el mismo valor que pusiste en `META_VERIFY_TOKEN` en Vercel.

**Por cada barbería**, guarda en su fila de `Tenant` (Supabase): `metaPhoneNumberId`,
`metaAccessToken` (permanente, no el de 24h de prueba) y `bookingMinNoticeMin`. No hace
falta `metaPort` para esta ruta (esa columna solo la usa el camino alternativo por VPS,
más abajo).

**Recordatorios de citas** (aviso ~1h antes): la ruta `/api/cron/whatsapp-reminders`
necesita dispararse cada 5 minutos. El cron de `vercel.json` ya lo intenta, pero el plan
Hobby de Vercel puede limitar la frecuencia de sus propios crons a 1 vez al día — si ves
que no llegan recordatorios a tiempo, usa un cron externo gratuito (ej.
[cron-job.org](https://cron-job.org)) apuntando cada 5 min a esa URL con el header
`Authorization: Bearer <CRON_SECRET>`.

**Camino alternativo (VPS/PM2), si algún día lo prefieres en vez de Vercel** — por
ejemplo si vuelves a Baileys, que sí necesita un proceso persistente: `app.js`,
`whatsapp-meta-bot.js`, `webhook-router.js` y `ecosystem.config.cjs` siguen en el repo,
marcados como opcionales. Desde la raíz del repo en el VPS:

```bash
npm install
cp .env.example .env   # DATABASE_URL (mismo Supabase), META_VERIFY_TOKEN, ROUTER_PORT
pm2 start ecosystem.config.cjs
pm2 save
```

### 4. Android (Capacitor)

`dashboard/capacitor.config.json` ya apunta al dominio real de Vercel — es lo único que
la app nativa necesita para cargar el panel (no hay backend aparte). Un solo APK/AAB
sirve para todas las barberías: el tenant se determina por la sesión (login con
barbería + usuario + contraseña), no por el build.

**Cómo probar en un celular hoy mismo (APK de depuración, sin Play Store):**

No hace falta Android Studio ni SDK local — `.github/workflows/android-build.yml` ya
compila el APK en GitHub Actions (JDK 21) cada vez que cambia algo bajo `dashboard/`.

1. Sube tus cambios a `main` (o dispara el workflow a mano: pestaña **Actions** →
   "Compilar APK de Android" → **Run workflow**).
2. Cuando termine la corrida, entra a esa corrida → sección **Artifacts** → descarga
   **`barber-saas-debug-apk`** → descomprime → `app-debug.apk`.
3. Pásalo al celular de prueba (por WhatsApp, Drive, USB, lo que sea) y ábrelo. Android
   va a pedir activar "Instalar apps de orígenes desconocidos" la primera vez — es
   normal para un APK que no viene de Play Store.

Esta versión sirve para pilotos/pruebas reales con clientes, pero está firmada con una
llave de depuración (no apta para publicar en Play Store).

**Cuando quieras publicarla de verdad en Play Store**, falta una release firmada:

1. Genera tu propio keystore (una sola vez, guárdalo — sin él no puedes actualizar la
   app después): `keytool -genkey -v -keystore release.keystore -alias barbersaas -keyalg RSA -keysize 2048 -validity 10000`
2. Agrega un bloque `signingConfigs` en `dashboard/android/app/build.gradle` que lo use,
   y guarda la contraseña del keystore como secret en GitHub Actions (nunca en el repo).
3. Genera el `.aab` con `./gradlew bundleRelease` (localmente o agregando un paso al
   workflow) y súbelo a Play Console.
4. Antes de publicar, revisa si quieres cambiar `appId` (`com.barbersaas.app`) o
   `appName` (`MiBarber`) en `capacitor.config.json`/`android/app/build.gradle` —
   el `appId` en particular **no se puede cambiar después** de la primera publicación.
