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
  'admin',
  'admin/login',
  'admin/orders',
  'admin/category',
  'admin/products',
  'admin/users',
  'admin/permissions',
  'admin/blog',
  'admin/reservations',
  'admin/delivery-zones',
  'admin/restaurant-info',
  'admin/messages',
  'admin/email-test',
  'admin/error-logs'
]

for (const route of spaRoutes) {
  const routeDir = join(distDir, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(indexFile, join(routeDir, 'index.html'))
}

copyFileSync(indexFile, join(distDir, '404.html'))
copyFileSync(indexFile, join(distDir, 'admin.html'))

console.log(`SPA fallback ready: copied index.html for ${spaRoutes.length} admin routes.`)
