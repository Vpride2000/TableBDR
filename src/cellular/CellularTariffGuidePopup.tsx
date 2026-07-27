import Guide from '../Guide'

export default function CellularTariffGuidePopup() {
  return (
    <main>
      <Guide
        initialExpandedEntities={['cellular-tariff-plans']}
        onlyEntities={['cellular-tariff-plans']}
        enableCellularAccountFilter
      />
    </main>
  )
}
