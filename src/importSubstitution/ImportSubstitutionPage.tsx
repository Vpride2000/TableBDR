import React from 'react'
import ImportSubstitutionTable from './ImportSubstitutionTable'

export default function ImportSubstitutionPage(): React.ReactElement {
  return (
    <section className="page-section">
      <div className="page-header">
        <h1>Импортозамещение</h1>
        <p className="hint">Управление показателями процента исполнения по подразделениям</p>
      </div>
      <div className="page-content">
        <ImportSubstitutionTable />
      </div>
    </section>
  )
}
