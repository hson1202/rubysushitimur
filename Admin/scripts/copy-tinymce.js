import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const topDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(topDir, 'node_modules', 'tinymce')
const dest = join(topDir, 'public', 'tinymce')

if (!existsSync(src)) {
  console.warn('TinyMCE is not installed at', src)
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(join(topDir, 'public'), { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('Copied TinyMCE to public/tinymce')
