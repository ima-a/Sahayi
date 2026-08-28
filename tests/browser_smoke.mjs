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
const waitFor = async expression => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
const setLocale = async locale => evaluate(`(() => { const select = document.querySelector('#language-selector'); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: appUrl })
await waitFor(`document.querySelector('h1')?.textContent === 'Sahayi'`)
await viewport(360, 800)
await screenshot('welcome-en-360')
await setLocale('hi')
await waitFor(`document.documentElement.lang === 'hi'`)
await viewport(390, 844)
await screenshot('welcome-hi-390')
await setLocale('ml')
await waitFor(`document.documentElement.lang === 'ml'`)
await viewport(768, 900)
await screenshot('welcome-ml-768')
await setLocale('en')
await waitFor(`document.documentElement.lang === 'en'`)

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' })
const focus = await evaluate(`(() => { const element = document.activeElement; const style = getComputedStyle(element); return { tag: element.tagName, outline: style.outlineStyle, width: style.outlineWidth } })()`)
if (focus.outline === 'none' || focus.width === '0px') throw new Error('Visible keyboard focus is missing')
await screenshot('keyboard-focus-768')

await clickText('Start')
await waitFor(`document.querySelector('h1')?.textContent === 'What do you need help with?'`)
await clickText('Browse all services')
await waitFor(`document.querySelector('h1')?.textContent === 'Supported services'`)
await viewport(1280, 900)
await screenshot('catalogue-en-desktop')
if (!await evaluate(`(() => { const button = [...document.querySelectorAll('.service-card')].find(item => item.textContent.includes('Update your Aadhaar address online')); if (!button) return false; button.click(); return true })()`)) throw new Error('Aadhaar service card is missing')
await waitFor(`document.querySelector('h1')?.textContent === 'Update your Aadhaar address online'`)
await screenshot('aadhaar-detail-en-desktop')
await clickText('Build personalized checklist')
await waitFor(`document.querySelector('h1')?.textContent === 'Personalized preparation checklist'`)
await viewport(390, 844)
await screenshot('checklist-en-390')
await clickText('Prepare synthetic demo worksheet')
await waitFor(`document.querySelector('.watermark')?.textContent.includes('DO NOT SUBMIT')`)
await viewport(360, 800)
const privateBlank = await evaluate(`[...document.querySelectorAll('.worksheet-fields dd')].some(item => item.textContent.includes('not collected') && item.textContent.includes('—'))`)
if (!privateBlank) throw new Error('Private worksheet field is not visibly blank')
await screenshot('synthetic-form-en-360')

await clickText('Start Over')
await waitFor(`document.querySelector('h1')?.textContent === 'Sahayi'`)
await clickText('Ask Sahayi AI')
await waitFor(`document.querySelector('h1')?.textContent === 'Ask Sahayi AI'`)
await viewport(768, 900)
const disabledConsent = await evaluate(`document.querySelector('.consent-choice input')?.disabled === true`)
if (!disabledConsent) throw new Error('Disabled-agent consent state is not exposed')
await screenshot('agent-disabled-en-768')

socket.close()
process.stdout.write(JSON.stringify({ screenshots: 9, widths: [360, 390, 768, 1280], locales: ['en', 'hi', 'ml'], visibleFocus: focus }, null, 2) + '\n')
