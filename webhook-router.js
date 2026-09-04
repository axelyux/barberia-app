// Único punto de entrada público para el webhook de WhatsApp (Meta solo permite
// UNA url de callback por App). Recibe todo el tráfico, mira a qué número de
// teléfono llegó cada mensaje (phone_number_id), busca a qué barbería
// corresponde en la base de datos, y le reenvía la petición cruda a esa
// barbería en su puerto local (donde corre su propio whatsapp-meta-bot.js).
import { createServer } from 'http'
import { request as httpRequest } from 'http'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const PORT = process.env.ROUTER_PORT ?? 3100
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN
if (!VERIFY_TOKEN) {
    console.error('❌ Falta META_VERIFY_TOKEN (debe ser idéntico al configurado en el panel de Meta, sin valor de respaldo).')
    process.exit(1)
}

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
    })

const forwardTo = (port, rawBody, req, res) => {
    const proxyReq = httpRequest(
        {
            hostname: 'localhost',
            port,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `localhost:${port}` },
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res)
        }
    )
    proxyReq.on('error', (err) => {
        console.error(`❌ No se pudo reenviar al puerto ${port}:`, err.message)
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'No se pudo conectar con el proceso de esa barbería.' }))
    })
    proxyReq.end(rawBody)
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    // Verificación del webhook (GET con hub.challenge): Meta la manda a nivel
    // de App, sin indicar todavía a qué número corresponde — la respondemos
    // aquí mismo con el mismo verify token para todas las barberías.
    console.log(`📥 ${req.method} ${req.url}`)

    if (req.method === 'GET' && url.pathname === '/webhook') {
        const mode = url.searchParams.get('hub.mode')
        const token = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end(challenge)
        } else {
            res.writeHead(403)
            res.end('Forbidden')
        }
        return
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
        const rawBody = await readBody(req)
        let phoneNumberId
        try {
            const parsed = JSON.parse(rawBody)
            phoneNumberId = parsed?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
        } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Payload inválido' }))
            return
        }

        if (!phoneNumberId) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, note: 'Sin phone_number_id, ignorado (ej. evento que no es de mensajes).' }))
            return
        }

        console.log(`   phone_number_id recibido: ${phoneNumberId}`)
        const tenant = await prisma.tenant.findUnique({ where: { metaPhoneNumberId: phoneNumberId } })
        if (!tenant?.metaPort) {
            console.error(`⚠️ Llegó un webhook para phone_number_id "${phoneNumberId}" sin ninguna barbería registrada.`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, note: 'Número no registrado a ninguna barbería.' }))
            return
        }
        console.log(`   reenviando a ${tenant.slug} (puerto ${tenant.metaPort})`)

        forwardTo(tenant.metaPort, rawBody, req, res)
        return
    }

    res.writeHead(404)
    res.end('Not found')
})

server.listen(PORT, () => console.log(`✅ Enrutador de webhooks de Meta escuchando en el puerto ${PORT}`))

process.on('unhandledRejection', (err) => {
    console.error('❌ Error no controlado (unhandledRejection):', err)
})
