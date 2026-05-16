import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('\nMissing DATABASE_URL.\n')
  console.error('Get it from: Supabase Dashboard → Settings → Database → Connection string (URI)')
  console.error('Then run:  DATABASE_URL="postgres://..." npm run db:reset\n')
  process.exit(1)
}

const sql = readFileSync(join(__dirname, '../src/lib/schema.sql'), 'utf8')

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('Connected. Running schema…')
  await client.query(sql)
  console.log('✓ Database reset complete.')
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
