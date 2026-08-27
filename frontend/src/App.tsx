import { useEffect, useState } from 'react'
import { getHealth, getPublicConfig, type HealthStatus } from './api'
import './App.css'

type Availability = 'loading' | 'available' | 'unavailable'

function App() {
  const [availability, setAvailability] = useState<Availability>('loading')
  const [name, setName] = useState('Sahayi')

  useEffect(() => {
    let active = true
    Promise.all([getHealth(), getPublicConfig()])
      .then(([health, config]: [HealthStatus, { application_name: string }]) => {
        if (active && health.status === 'ok') { setName(config.application_name); setAvailability('available') }
      })
      .catch(() => active && setAvailability('unavailable'))
    return () => { active = false }
  }, [])

  const statusText = availability === 'loading' ? 'Checking service availability…' : availability === 'available' ? 'Service is ready' : 'Service is temporarily unavailable'
  return <main className="kiosk-shell"><section className="welcome-card" aria-labelledby="sahayi-title">
    <p className="eyebrow">Hackathon prototype</p><div className="mark" aria-hidden="true">S</div>
    <h1 id="sahayi-title">{name}</h1><p className="tagline">Government services, explained around what you need.</p>
    <p className={`availability ${availability}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{statusText}</p>
    <button type="button" disabled aria-describedby="start-note">Start</button><p id="start-note" className="start-note">Guided service journeys are coming next.</p>
  </section></main>
}

export default App
