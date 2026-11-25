export function startColumnResize(
  event: {
    clientX: number
    currentTarget: { closest: (selector: 'th') => { getBoundingClientRect: () => { width: number } } | null }
    preventDefault: () => void
    stopPropagation: () => void
  },
  minimumWidth: number,
  onWidthChange: (width: number) => void,
  stopOnPointerCancel = false,
): void {
  event.preventDefault()
  event.stopPropagation()
  const header = event.currentTarget.closest('th')
  if (!header) return

  const startX = event.clientX
  const startWidth = header.getBoundingClientRect().width
  const resizeColumn = (moveEvent: PointerEvent): void => {
    onWidthChange(Math.max(minimumWidth, startWidth + moveEvent.clientX - startX))
  }
  const stopResizing = (): void => {
    window.removeEventListener('pointermove', resizeColumn)
    window.removeEventListener('pointerup', stopResizing)
    if (stopOnPointerCancel) window.removeEventListener('pointercancel', stopResizing)
  }

  window.addEventListener('pointermove', resizeColumn)
  window.addEventListener('pointerup', stopResizing)
  if (stopOnPointerCancel) window.addEventListener('pointercancel', stopResizing)
}
