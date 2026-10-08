/** Print one area of the page on a letter sheet or an 80 mm thermal roll
 * (doc 09): the browser prints, so any installed printer works. */
export function printArea(paper: 'letter' | 'thermal') {
  const style = document.createElement('style')
  style.textContent =
    paper === 'thermal'
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: letter; margin: 14mm; }'
  document.head.appendChild(style)
  const cleanup = () => {
    style.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

/** wa.me wants the number with its country code; Dominican numbers are +1. */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  const number = digits.length === 10 ? `1${digits}` : digits
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
