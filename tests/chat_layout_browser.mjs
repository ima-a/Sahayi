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
let mockScript
if (process.env.SAHAYI_CHAT_MOCK === '1') {
  mockScript = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (url, init) => {
      if (String(url).endsWith('/assistant/turn')) {
        const body = JSON.parse(init.body)
        return new Response(JSON.stringify({status:'ok',locale:body.locale,message:'Synthetic assistant reply. '+body.message,
          selection:{state:'none',service_id:null,choices:[]},fact_cards:[],sources:[],actions:[],tool_trace:[],disclaimer:'Synthetic browser verification.',fallback:false}),{headers:{'Content-Type':'application/json'}})
      }
      const response = await original(url, init)
      if (String(url).endsWith('/public-config')) return new Response(JSON.stringify({...await response.json(),agent_available:true}),{headers:{'Content-Type':'application/json'}})
      return response
    }
  })()` })
}
try {
  await send('Page.navigate', { url: appUrl })
  await waitFor(`document.querySelector('.consent-choice input')?.disabled === false`)
  await evaluate(`document.querySelector('.consent-choice input').click()`)
  await viewport(390,844)
  for (const text of ['hello', 'hi']) {
    await evaluate(`(() => { const input=document.querySelector('#agent-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));input.focus() })()`)
    await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await waitFor(`document.querySelector('#agent-message').value === '' && Boolean(document.querySelector('.agent-response .message.assistant'))`)
  }
  for (const width of [390,1280]) {
    await viewport(width, width < 700 ? 844 : 900)
    const checks=await evaluate(`(() => {const log=document.querySelector('[role=log]'),form=document.querySelector('.agent-form'),input=document.querySelector('#agent-message');return {order:!!(log.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING),above:log.getBoundingClientRect().bottom<=form.getBoundingClientRect().top,users:log.querySelectorAll('.message.user').length,replies:log.querySelectorAll('.message.assistant').length,compact:input.getBoundingClientRect().height<110,scrolled:log.scrollHeight-log.clientHeight-log.scrollTop<3}})()`)
    if (!checks.order || !checks.above || checks.users !== 2 || checks.replies !== 2 || !checks.compact || !checks.scrolled) throw new Error(JSON.stringify(checks))
    await evaluate(`document.querySelector('.agent-form').scrollIntoView({block:'end'})`)
    await screenshot(`chat-layout-${width}`)
  }
  console.log(JSON.stringify({messagesAboveComposer:true,bubbles:true,enterSends:true,compactInput:true,latestMessageVisible:true,widths:[390,1280],mocked:process.env.SAHAYI_CHAT_MOCK==='1'}))
} finally {
  if (mockScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: mockScript.identifier })
  socket.close()
}
