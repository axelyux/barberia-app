import { prisma } from "@/lib/db";

// Helpers genéricos para que ninguna Server Action pueda tocar un registro de otra
// barbería solo por conocer su id: en vez de `prisma.<modelo>.update({ where: { id } })`
// (que no valida dueño), se usa `updateMany`/`deleteMany` con `{ id, tenantId }` — si el
// registro no es de ese tenant (o no existe), no actualiza nada y lanzamos el mismo
// error de "no encontrado" que si de verdad no existiera, sin filtrar esa diferencia.

export async function updateOwned(model, id, tenantId, data, notFoundMessage = "No encontrado.") {
    const result = await prisma[model].updateMany({ where: { id, tenantId }, data });
    if (result.count === 0) throw new Error(notFoundMessage);
}

export async function deleteOwned(model, id, tenantId, notFoundMessage = "No encontrado.") {
    const result = await prisma[model].deleteMany({ where: { id, tenantId } });
    if (result.count === 0) throw new Error(notFoundMessage);
}

// Para leer un registro relacionado (producto, servicio, barbero...) que se va a copiar
// o referenciar desde otro modelo: falla si no existe o no pertenece a este tenant.
export async function findOwnedOrThrow(model, id, tenantId, notFoundMessage = "No encontrado.") {
    const row = await prisma[model].findFirst({ where: { id, tenantId } });
    if (!row) throw new Error(notFoundMessage);
    return row;
}
