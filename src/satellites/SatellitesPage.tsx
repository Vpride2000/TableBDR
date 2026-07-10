export default function SatellitesPage() {
  function openControlWindow(): void {
    const popupUrl = `${window.location.pathname}#satellites-control`
    const popup = window.open(
      popupUrl,
      'satellites-control-window',
      'popup=yes,width=1180,height=760,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  return (
    <section className="page-section satellites-section">
      <div className="page-header">
        <h1>Спутники</h1>
        <p className="hint">Раздел временно содержит только переход в подраздел Контроль.</p>
      </div>

      <div className="satellites-control-action">
        <button className="page-action-btn page-action-btn--secondary" type="button" onClick={openControlWindow}>
          Контроль
        </button>
      </div>
    </section>
  )
}
