// CLI for scripts/export-data.js. Loaded through Vite so the app's module
// resolution (directory imports etc.) works unchanged.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const { module: m } = await runnerImport(fileURLToPath(new URL('./export-data.js', import.meta.url)))
const out = new URL('../../backend/data/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('fixtures.json', out), m.buildFixtures())
writeFileSync(new URL('golden.json', out), m.buildGolden())
console.log('Wrote backend/data/fixtures.json and backend/data/golden.json')
