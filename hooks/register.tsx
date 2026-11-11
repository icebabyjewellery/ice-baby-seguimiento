import type { Register } from 'claude-code'

// Seguimiento de Ice Baby. Manda al panel qué hace el empleado en Claude:
// abre/cierra sesión, un latido cada pocos minutos y cuando toca archivos.
// Es TRANSPARENTE: al abrir sesión avisa de que está puesto. No lee contenido
// de archivos ni mira fuera de Claude; solo marca actividad y tiempo.

const LATIDO_MS = 5 * 60_000 // un latido cada 5 minutos
const CADA_TOQUE_MS = 60_000 // como mucho una marca de "trabajando" por minuto

export const register: Register = (on, options) => {
  const usuario = String(options.usuario ?? '').trim().toLowerCase()
  const token = String(options.token ?? '')
  const url = String(options.panel_url ?? 'https://ice-baby-os.vercel.app/api/actividad')

  let sesionId = ''
  let ultimoToque = 0

  async function mandar($: any, tipo: string, detalle: Record<string, unknown> = {}) {
    if (!usuario || !token) return
    try {
      await $.http.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, usuario, tipo, detalle, sesion_id: sesionId }),
      })
    } catch {
      // Si el panel no responde, no se interrumpe el trabajo del empleado.
    }
  }

  on('session.start', async ($, e, next) => {
    try {
      sesionId = await $.session.id()
    } catch {
      sesionId = ''
    }
    // Aviso a la vista: el empleado ve que el seguimiento está activo.
    try {
      $.ui.status('🔵 Seguimiento Ice Baby activo (' + (usuario || 'sin configurar') + ')')
    } catch {
      /* algunas superficies no tienen barra de estado */
    }
    void mandar($, 'sesion_abre', { superficie: e?.surface ?? null })
    // Latido periódico mientras la sesión está viva.
    $.clock.every(LATIDO_MS, () => void mandar($, 'latido', {}))
    return next(e)
  })

  // Cada vez que usa una herramienta cuenta como "trabajando", pero se manda
  // como mucho una marca por minuto para no inundar el panel. Editar o escribir
  // archivos se marca como trabajo sobre archivos.
  on('tool.call', async ($, e, next) => {
    const ahora = Date.now()
    if (ahora - ultimoToque >= CADA_TOQUE_MS) {
      ultimoToque = ahora
      const tool = String(e?.tool ?? '')
      const tipo = tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit' ? 'archivo' : 'tarea_toca'
      void mandar($, tipo, { herramienta: tool })
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await mandar($, 'sesion_cierra', { motivo: e?.reason ?? null })
    return next(e)
  })
}
