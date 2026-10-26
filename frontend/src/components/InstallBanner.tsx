import { useEffect, useState } from 'react'

import { Button } from './ui'

/** D6 (decision 135): the app on the phone's home screen. Android and
 * desktop Chrome fire `beforeinstallprompt`; we keep it and show one quiet
 * card with a real «Instalar» button. iPhone has no prompt: the card tells
 * the two taps. Dismissed once, it stays away on that phone. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KEY = 'cobradia:install-dismissed'

function standalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => dismissed() || standalone())
  const iphone = isIphone()

  useEffect(() => {
    if (hidden) return
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [hidden])

  if (hidden || (!prompt && !iphone)) return null

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: the card comes back next time */
    }
    setHidden(true)
  }

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setHidden(true)
    setPrompt(null)
  }

  return (
    <section
      aria-label="Instalar Cobradía"
      className="flex flex-wrap items-center gap-3 rounded-card border border-brand-700/25 bg-brand-50 px-4 py-3 text-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Lleva Cobradía en tu pantalla de inicio</p>
        <p className="text-[12.5px] text-muted">
          {iphone
            ? 'En Safari, toca «Compartir» y luego «Agregar a inicio». Abre a pantalla completa, como una app.'
            : 'Se instala sin pasar por la tienda y abre a pantalla completa, como una app.'}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {prompt ? (
          <Button type="button" size="sm" onClick={install}>
            Instalar
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </section>
  )
}
