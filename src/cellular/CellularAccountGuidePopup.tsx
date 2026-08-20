import Guide from '../Guide'

export default function CellularAccountGuidePopup() {
  return (
    <main>
      <Guide
        initialExpandedEntities={['cellular-accounts']}
        onlyEntities={['cellular-accounts']}
        lookupEntities={['departments']}
      />
    </main>
  )
}
