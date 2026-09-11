// Respaldo manual de TODA la base de datos a un archivo JSON local — alternativa gratuita
// a los backups automáticos de Supabase (que solo vienen en el plan de pago Pro+).
//
// Cómo usarlo: desde dashboard/, corre  npm run backup
// Guarda un archivo nuevo en dashboard/backups/backup-<fecha>.json cada vez que lo corres
// (no sobreescribe los anteriores). Ese archivo NUNCA se sube a git — incluye datos
// sensibles de verdad (contraseñas hasheadas, tokens de WhatsApp, clientes, finanzas),
// trátalo exactamente igual que la base de datos real: no lo compartas ni lo subas a
// ningún lado público.
import { PrismaClient, Prisma } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
    const modelNames = Prisma.dmmf.datamodel.models.map((m) => m.name);
    const dump = {};

    for (const modelName of modelNames) {
        const accessor = modelName.charAt(0).toLowerCase() + modelName.slice(1);
        dump[modelName] = await prisma[accessor].findMany();
    }

    const backupsDir = join(__dirname, "..", "backups");
    mkdirSync(backupsDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(backupsDir, `backup-${stamp}.json`);
    writeFileSync(filePath, JSON.stringify(dump, null, 2));

    const totalRows = Object.values(dump).reduce((sum, rows) => sum + rows.length, 0);
    console.log(`✅ Respaldo guardado en: ${filePath}`);
    console.log(`   ${modelNames.length} tablas, ${totalRows} filas en total.`);
}

main()
    .catch((err) => {
        console.error("❌ Falló el respaldo:", err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
