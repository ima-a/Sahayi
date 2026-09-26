import { writeFile } from 'node:fs/promises'

const browserPort = process.env.SAHAYI_CDP_PORT ?? '9222'
const appUrl = process.env.SAHAYI_BROWSER_URL ?? 'http://127.0.0.1:18080'
const outputDir = process.env.SAHAYI_SCREENSHOT_DIR ?? '/tmp/sahayi-browser'
const targets = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json()
const target = targets.find(item => item.type === 'page')
if (!target) throw new Error('No browser page target')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let nextId = 1
const pending = new Map()
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const waitFor = async (expression, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out: ${expression}`)
}
const viewport = async (width, height = 900) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
  await delay(100)
  const fits = await evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  if (!fits) throw new Error(`Horizontal overflow at ${width}px`)
}
const screenshot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await writeFile(`${outputDir}/${name}.png`, Buffer.from(data, 'base64'))
}
const clickText = async text => {
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  if (!clicked) throw new Error(`Missing button: ${text}`)
}
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: appUrl })
await waitFor(`Boolean(document.querySelector('#agent-title'))`)
await waitFor(`!document.body.textContent.includes('Checking availability')`)
await evaluate(`(() => { window.__aiTurns=[]; window.__aiResults=[]; const original=window.fetch.bind(window); window.fetch=async (input,init)=>{ const response=await original(input,init); if(String(input).endsWith('/assistant/turn')) { window.__aiTurns.push(JSON.parse(init.body)); window.__aiResults.push(await response.clone().json()) } return response } })()`)
await clickText('Browse all services')
await waitFor(`document.querySelectorAll('.service-card').length === 2`)
await evaluate(`([...document.querySelectorAll('.service-card')].find(button=>button.textContent.includes('Kerala'))).click()`)
await waitFor(`Boolean(document.querySelector('[data-action=procedure]'))`)
if (!await evaluate(`Boolean(document.querySelector('#agent-title')) && document.querySelector('.journey-summary').textContent.includes('Kerala') && window.__aiTurns.length === 0`)) throw new Error('Catalogue did not supply context to AI without a provider request')
await viewport(390,844)
if (!await evaluate(`document.querySelector('[data-action=prepare]').getBoundingClientRect().height < 100`)) throw new Error('Oversized mobile preparation action')
await screenshot('ai-selected-pension-mobile')
await evaluate(`window.scrollTo(0,document.body.scrollHeight)`)
if (!await evaluate(`getComputedStyle(document.querySelector('.journey-summary')).position === 'static' && document.querySelector('.journey-summary').getBoundingClientRect().bottom < 0`)) throw new Error('Current step floats when scrolling')
let liveTool = false
if (process.env.SAHAYI_LIVE_AI === '1') {
  await waitFor(`document.querySelector('.consent-choice input')?.disabled === false`)
  await evaluate(`document.querySelector('.consent-choice input').click()`)
  await evaluate(`(() => {const input=document.querySelector('#agent-message');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'What documents should I prepare for this service?');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await evaluate(`document.querySelector('.agent-form button[type=submit]').click()`)
  await waitFor(`window.__aiResults.length === 1`, 900)
  const result = await evaluate(`({service:window.__aiTurns[0].service_id,consent:window.__aiTurns[0].consent,status:window.__aiResults[0].status,fallback:window.__aiResults[0].fallback,tools:window.__aiResults[0].tool_trace})`)
  if (result.service !== 'kerala-ign-oap' || result.consent !== true || result.status !== 'ok' || result.fallback || !result.tools?.length) throw new Error('Live context-aware AI tool check failed: '+JSON.stringify(result))
  liveTool = true
  await screenshot('ai-context-response')
}
await clickText('Browse all services')
await waitFor(`document.querySelectorAll('.service-card').length === 2`)
await evaluate(`([...document.querySelectorAll('.service-card')].find(button=>button.textContent.includes('Aadhaar'))).click()`)
await waitFor(`Boolean(document.querySelector('[data-action=procedure]'))`)
if (!await evaluate(`document.querySelector('.journey-summary').textContent.includes('Aadhaar') && !document.querySelector('.conversation') && !document.querySelector('.agent-response')`)) throw new Error('Prior service conversation survived context switch')
await clickText('End session')
await waitFor(`Boolean(document.querySelector('#agent-title')) && !document.querySelector('.journey-summary')`)
if (!await evaluate(`!document.querySelector('.consent-choice input').checked && !document.querySelector('#agent-message')`)) throw new Error('Session did not clear consent and input')
socket.close()
console.log(JSON.stringify({aiEntry:true,catalogueContext:true,noAutomaticProviderCall:true,staticSummary:true,mobileActions:true,contextReset:true,sessionCleanup:true,liveTool}))
