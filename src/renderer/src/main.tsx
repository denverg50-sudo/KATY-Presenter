import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { ControlApp } from './control/ControlApp'
import { OutputApp } from './output/OutputApp'

if (import.meta.env.DEV) {
  const errs: string[] = ((window as unknown as { __selahErrors: string[] }).__selahErrors = [])
  window.addEventListener('error', (e) => errs.push(String(e.message)))
  window.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason)))
}

const isOutput = location.hash === '#output'
document.body.classList.add(isOutput ? 'is-output' : 'is-control')
if (window.api.platform === 'darwin') document.body.classList.add('mac')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOutput ? <OutputApp /> : <ControlApp />}</StrictMode>
)
