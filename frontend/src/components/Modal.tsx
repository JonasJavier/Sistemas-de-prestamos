import { useEffect, useRef, type ReactNode } from 'react'

/** Every overlay of the app sits on the native <dialog> in modal mode: the
 * browser traps the focus, makes the page behind inert, closes with Esc and
 * gives the focus back on close (WCAG 2.2, doc 08 - 7). Mount it to open it;
 * unmount it (onClose) to close it. A click on the backdrop closes too. */
export function Modal({
  onClose,
  label,
  labelledBy,
  align = 'center',
  children,
}: {
  onClose: () => void
  label?: string
  labelledBy?: string
  /** center: dialogs · top: the search · bottom: the phone menu sheet. */
  align?: 'center' | 'top' | 'bottom'
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Only a click that starts AND ends on the backdrop closes: selecting text
  // in a field and letting go outside the panel must not lose the form.
  const pressedOutside = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  const placement = {
    center: 'items-center justify-center px-4',
    top: 'items-start justify-center px-4 pt-[12vh]',
    bottom: 'items-end',
  }[align]

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault() // React decides: unmounting closes it
        onClose()
      }}
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose()
        pressedOutside.current = false
      }}
      className={`m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-black/40 open:flex ${placement}`}
    >
      {children}
    </dialog>
  )
}
