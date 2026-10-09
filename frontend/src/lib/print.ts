/** Print one area of the page on a letter sheet or an 80 mm thermal roll
 * (doc 09): the browser prints, so any installed printer works. */
export function printArea(paper: 'letter' | 'thermal') {
  // A constructed sheet, not a <style> tag: the CSP allows no inline styles
  // (decision 102).
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(
    paper === 'thermal'
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: letter; margin: 14mm; }',
  )
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  const cleanup = () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
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
