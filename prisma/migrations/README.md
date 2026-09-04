# Migraciones de Prisma (Postgres)

Esta carpeta se vació a propósito: el historial anterior estaba grabado para SQLite
(`migration_lock.toml` decía `provider = "sqlite"`) y no aplica a PostgreSQL — Prisma
no permite mezclar proveedores en un mismo historial de migraciones.

## Cómo generar el primer migration real

Necesitas una base de datos Postgres viva (local, o ya tu proyecto de Supabase) apuntada
por `DATABASE_URL`/`DIRECT_URL` en tu `.env`. Desde `dashboard/`:

```bash
npx prisma migrate dev --name init_postgres
```

Esto crea `prisma/migrations/<timestamp>_init_postgres/migration.sql` a partir del
`schema.prisma` actual y lo aplica a tu base de datos. Súbelo a git — es el que después
correrá en producción con `npx prisma migrate deploy` (ver `dashboard/README.md`).

No uses `prisma db push` como mecanismo normal: no deja historial reproducible.
