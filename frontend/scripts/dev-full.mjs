// Starts the backend (uvicorn, port 8000) and the frontend in backend mode (vite, port 5173) together.
// Ctrl+C stops both. Usage: npm run dev:full
//   --memory (npm run dev:full:memory): the backend uses an in-memory database instead of MONGODB_URI
//   from backend/.env — for when the Atlas cluster is unreachable. Seeded on start, nothing saved.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(frontend, '..')
const win = process.platform === 'win32'

const memory = process.argv.includes('--memory')
// Set in the environment, it wins over backend/.env (load_dotenv never overrides).
const backendEnv = memory ? { MONGODB_URI: 'memory' } : {}
if (memory) console.log('[dev:full] In-memory database: demo data is seeded on start and lost when you stop.')

const venvPython =path.join(root, 'backend', '.venv', win ? 'Scripts/python.exe' : 'bin/python')
const python = existsSync(venvPython) ? venvPython : win ? 'python' : 'python3'
if (!existsSync(venvPython)) console.warn(`[dev:full] No venv at backend/.venv, falling back to "${python}" on PATH.`)
if (!memory && !existsSync(path.join(root, 'backend', '.env'))) console.warn('[dev:full] backend/.env not found. The backend needs MONGODB_URI (see backend/.env.example).')

const procs = [
  { name: 'backend ', color: '\x1b[36m', cmd: python, args: ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--port', '8000'], cwd: root, env: backendEnv },
  { name: 'frontend', color: '\x1b[35m', cmd: win ? 'npm.cmd' : 'npm', args: ['run', 'dev:backend'], cwd: frontend, shell: win },
]

const children = procs.map((p) => {
  const child = spawn(p.cmd, p.args, { cwd: p.cwd, shell: p.shell, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1', ...p.env } })
  const out = (stream) => stream.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${p.color}[${p.name}]\x1b[0m ${l}`)))
  out(child.stdout)
  out(child.stderr)
  child.on('exit', (code) => {
    console.log(`${p.color}[${p.name}]\x1b[0m exited (${code})`)
    stop()
  })
  return child
})

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const c of children) {
    if (win && c.pid) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' })
    else c.kill()
  }
  setTimeout(() => process.exit(0), 500)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
