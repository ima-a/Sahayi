import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../../form-registry/', import.meta.url)
const services = new Set()
for (const file of await readdir(root)) {
  if (!file.endsWith('.json')) continue
  const manifest = JSON.parse(await readFile(new URL(file, root), 'utf8'))
  if (services.has(manifest.service_id) || !manifest.fields.length || !manifest.human_review_notes || !manifest.translation_limitations) throw new Error('Invalid form registration')
  services.add(manifest.service_id)
  if (manifest.output === 'worksheet') {
    if (manifest.asset || manifest.sha256 || manifest.page_count || !manifest.fallback_reason) throw new Error('Invalid worksheet availability')
  } else {
    if (!['acroform', 'overlay'].includes(manifest.output) || !/^[a-zA-Z0-9._-]+\.pdf$/.test(manifest.asset) || !manifest.page_count) throw new Error('Unreviewed form')
    const bytes = await readFile(new URL(manifest.asset, root))
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Form checksum mismatch')
  }
  if (new Set(manifest.fields.map(f => f.field_id)).size !== manifest.fields.length) throw new Error('Duplicate field')
}
if (services.size !== 2) throw new Error('Missing form availability')
console.log('Validated two form availability manifests; no runtime form retrieval.')
