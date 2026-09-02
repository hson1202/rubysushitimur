import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const indexFile = join(distDir, 'index.html')

if (!existsSync(indexFile)) {
  console.error('SPA fallback skipped: dist/index.html was not found.')
  process.exit(1)
}

const spaRoutes = [
  'order',
  'cart',
  'menu',
  'contact',
  'myorders',
  'track-order',
  'admin',
  'account',
  'account/profile',
  'account/password',
  'account/addresses',
  'account/orders',
  'home',
  'about',
  'reservation'
]

for (const route of spaRoutes) {
  const routeDir = join(distDir, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(indexFile, join(routeDir, 'index.html'))

  if (!route.includes('/') && !route.includes('.')) {
    copyFileSync(indexFile, join(distDir, `${route}.html`))
  }
}

copyFileSync(indexFile, join(distDir, '404.html'))

console.log(`SPA fallback ready: copied index.html for ${spaRoutes.length} routes.`)
