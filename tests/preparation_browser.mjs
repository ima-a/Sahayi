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
const clickWhilePresent = async text => {
  for (let step = 0; step < 30; step += 1) {
    const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
    if (!clicked) return step
    await delay(50)
  }
  throw new Error(`Too many progressive fields: ${text}`)
}
const setLocale = async locale => evaluate(`(() => { const select = document.querySelector('#language-selector'); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: appUrl })
await waitFor(`Boolean(document.querySelector('#service-query')) && !document.querySelector('.state-panel')`)
const setInput = async (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); return true })()`)
for (const [locale, goal, personal] of [
  ['en', 'old age pension Kerala', 'SYNTHETIC TEST PERSON'],
  ['hi', 'आधार पता अपडेट', 'काल्पनिक परीक्षण क्षेत्र'],
  ['ml', 'കേരള വാർദ്ധക്യ പെൻഷൻ', 'സാങ്കൽപ്പിക പരീക്ഷണ സ്ഥലം'],
]) {
  await setLocale(locale)
  await waitFor(`Boolean(document.querySelector('#service-query')) && !document.querySelector('.state-panel')`)
  await evaluate(`(() => { window.__requests=[]; window.__urls=[]; window.__revoked=[]; const original=window.fetch.bind(window); window.fetch=(input,init)=>{ window.__requests.push(String(init?.body ?? '')); return original(input,init) }; const create=URL.createObjectURL.bind(URL), revoke=URL.revokeObjectURL.bind(URL); URL.createObjectURL=(blob)=>{ const url=create(blob); window.__urls.push(url); return url }; URL.revokeObjectURL=(url)=>{window.__revoked.push(url); return revoke(url)} })()`)
  await setInput('#service-query', goal)
  await evaluate(`document.querySelector('.conversation-composer button[type="submit"]').click()`)
  await waitFor(`Boolean(document.querySelector('.suggested-responses button'))`)
  await evaluate(`document.querySelector('.suggested-responses button').click()`)
  await waitFor(`Boolean(document.querySelector('.conversation-question'))`)
  for (let step=0; step<16; step++) {
    await waitFor(`!document.querySelector('.activity')`)
    if (!await evaluate(`Boolean(document.querySelector('.conversation-question'))`)) break
    await screenshot(`preparation-${locale}-${step}`)
    const input = await evaluate(`document.querySelector('#preparation-value')?.tagName ?? null`)
    if (input) {
      await setInput('#preparation-value', personal)
      await evaluate(`document.querySelector('.conversation-question form button[type="submit"]').click()`)
    } else {
      await evaluate(`document.querySelector('.conversation-question .suggested-responses button').click()`)
    }
    await delay(300)
  }
  await waitFor(`!document.querySelector('.conversation-question') && !document.querySelector('.activity') && Boolean(document.querySelector('.draft-download input'))`)
  await evaluate(`document.querySelector('.draft-download input:not(:checked)')?.click()`)
  await waitFor(`Boolean(document.querySelector('.draft-download a[download]'))`)
  const encoded=await evaluate(`fetch(document.querySelector('.draft-download a').href).then(r=>r.arrayBuffer()).then(bytes=>{let result='';for(const byte of new Uint8Array(bytes))result+=String.fromCharCode(byte);return btoa(result)})`)
  await writeFile(`${outputDir}/prepared-${locale}.pdf`, Buffer.from(encoded,'base64'))
  if (await evaluate(`window.__requests.some(body=>body.includes(${JSON.stringify(personal)}))`)) throw new Error('Personal field escaped browser')
  await viewport(locale==='hi'?390:locale==='ml'?768:1280)
  await screenshot(`prepared-${locale}`)
  await evaluate(`document.querySelector('.end-session').click()`)
  await waitFor(`Boolean(document.querySelector('#service-query'))`)
  if (!await evaluate(`window.__urls.every(url=>window.__revoked.includes(url))`)) throw new Error('Artifact URL not revoked')
  if (await evaluate(`document.body.innerText.includes(${JSON.stringify(personal)})`)) throw new Error('Personal field survived session')
}
await setLocale('en'); await waitFor(`!document.querySelector('.state-panel')`)
for (const [goal, expected] of [['renew my passport', 'no'], ['address update', 'ambiguous']]) {
  await setInput('#service-query', goal)
  await evaluate(`document.querySelector('.conversation-composer button[type="submit"]').click()`)
  await delay(200)
  if (expected==='ambiguous' && !await evaluate(`document.querySelectorAll('.candidate-list .service-card').length===2`)) throw new Error('Ambiguity not clarified')
  if (expected==='no' && await evaluate(`Boolean(document.querySelector('.trust-card'))`)) throw new Error('Unsupported service selected')
  await evaluate(`document.querySelector('.end-session').click()`)
  await waitFor(`Boolean(document.querySelector('#service-query')) && !document.querySelector('.state-panel')`)
}
await setInput('#service-query', 'SYNTHETIC SESSION INPUT')
await evaluate(`document.querySelector('.conversation-header button').click()`)
await waitFor(`document.querySelector('#service-query')?.value === '' && !document.querySelector('.state-panel')`)
await setInput('#service-query', 'SYNTHETIC SESSION INPUT')
await evaluate(`(async () => { const config=await fetch('/api/v1/public-config').then(r=>r.json()); const original=Date.now; Date.now=()=>original()+(config.inactivity_timeout_seconds+1)*1000; document.dispatchEvent(new Event('visibilitychange')); Date.now=original })()`)
await waitFor(`document.body.textContent.includes('Session cleared after inactivity') && document.querySelector('#service-query')?.value === ''`)
socket.close()
console.log(JSON.stringify({locales:['en','hi','ml'],pension:true,aadhaarWithoutUpload:true,downloads:true,urlCleanup:true,personalValuesLocal:true,unsupported:true,ambiguous:true,startOver:true,inactivityCleanup:true}))
