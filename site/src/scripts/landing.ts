const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-product-tab]'),
)
const panels = document.querySelectorAll<HTMLElement>('[data-product-panel]')
const tabList = document.querySelector('.product-tabs')

// Enhance into accessible tabs only when their keyboard behavior is available.
tabList?.setAttribute('role', 'tablist')
function selectTab(index: number, focus = false) {
  tabs.forEach((tab, current) => {
    const selected = current === index
    tab.setAttribute('aria-selected', String(selected))
    tab.removeAttribute('aria-pressed')
    tab.tabIndex = selected ? 0 : -1
  })
  panels.forEach((panel) => {
    panel.hidden = panel.id !== tabs[index].getAttribute('aria-controls')
  })
  const number = document.querySelector('.stage-number')
  if (number) number.textContent = `0${index + 1} — 04`
  if (focus) tabs[index].focus()
}
tabs.forEach((tab, index) => {
  tab.setAttribute('role', 'tab')
  tab.addEventListener('click', () => selectTab(index))
  tab.addEventListener('keydown', (event) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft')
      next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(next, true)
  })
})
panels.forEach((panel) => panel.setAttribute('role', 'tabpanel'))
if (tabs.length) selectTab(0)

document
  .querySelectorAll<HTMLButtonElement>('[data-billing]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      const annual = button.dataset.billing === 'annual'
      document
        .querySelectorAll('[data-billing]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button)),
        )
      document
        .querySelectorAll<HTMLElement>('[data-price]')
        .forEach((price) => {
          price.textContent = Number(
            annual ? price.dataset.annual : price.dataset.monthly,
          ).toLocaleString('es-DO')
        })
      document.querySelectorAll('[data-price-period]').forEach((period) => {
        period.textContent = annual ? '/ año' : '/ mes'
      })
      document
        .querySelectorAll<HTMLElement>('[data-price-description]')
        .forEach((description) => {
          description.textContent =
            (annual
              ? description.dataset.annualCopy
              : description.dataset.monthlyCopy) ?? ''
        })
      const status = document.querySelector('[data-billing-status]')
      if (status)
        status.textContent = annual
          ? 'Precios anuales: Esencial RD$ 9,900; Profesional RD$ 22,900; Empresa RD$ 36,900. Pago anual completo.'
          : 'Precios mensuales: Esencial RD$ 990; Profesional RD$ 2,290; Empresa RD$ 3,690.'
    })
  })

// Elements remain visible if JavaScript fails or motion is disabled.
const motion = matchMedia('(prefers-reduced-motion: reduce)')
if (!motion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.remove('reveal-pending')
        observer.unobserve(entry.target)
      })
    },
    { threshold: 0.08 },
  )
  document.querySelectorAll<HTMLElement>('.reveal').forEach((element) => {
    if (element.getBoundingClientRect().top > innerHeight) {
      element.classList.add('reveal-pending')
      observer.observe(element)
    }
  })
  motion.addEventListener('change', () => {
    if (motion.matches) {
      document
        .querySelectorAll('.reveal-pending')
        .forEach((element) => element.classList.remove('reveal-pending'))
      observer.disconnect()
    }
  })
}
