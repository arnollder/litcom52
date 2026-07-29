import { handleApiRequest } from './scripts/lib/http-api.mjs'

function attachApi(middlewares) {
  middlewares.use(async (req, res, next) => {
    const handled = await handleApiRequest(req, res)
    if (!handled) next()
  })
}

export default function moyskladApiPlugin() {
  return {
    name: 'moysklad-api',
    configureServer(server) {
      attachApi(server.middlewares)
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares)
    },
  }
}
