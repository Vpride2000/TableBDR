export interface SatelliteRow {
  index: number
  description: string
  objectName: string
  branch: string
  macAddress: string
  tariff: string
  month: string
  unit: string
  quantity: string
  amountWithoutVat: string
}

export interface SatelliteBranchSummaryRow {
  branch: string
  totalWithoutVat: number
}

function normalizeCellText(value: string | null): string {
  return (value ?? '').trim()
}

function normalizeMacText(value: string): string {
  return value
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E')
    .replace(/а/g, 'a')
    .replace(/в/g, 'b')
    .replace(/с/g, 'c')
    .replace(/е/g, 'e')
}

function parseNameFields(sourceName: string): {
  cleanedDescription: string
  objectName: string
  macAddress: string
  tariff: string
  month: string
} {
  const macNormalized = normalizeMacText(sourceName)

  const objectMatch = sourceName.match(/на направлении\s+"([^"]+)"/i)
  const macMatch = macNormalized.match(/([0-9A-F]{2}(?::[0-9A-F]{2}){5})/i)
  const tariffMatch = sourceName.match(/(\d+\s*Кбит\/с)/i)
  const monthMatch = sourceName.match(/в\s+([А-Яа-яЁё]+)\s+\d{4}\s*г\./i)

  const cleaned = sourceName
    .replace(/Ежемесячная оплата за предоставление услуги передачи данных/gi, '')
    .replace(/через\s+КА\s+"Ямал-401"\s+с\s+максимально\s+возможной\s+скоростью/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    cleanedDescription: cleaned,
    objectName: normalizeCellText(objectMatch?.[1] ?? null),
    macAddress: normalizeCellText(macMatch?.[1] ?? null),
    tariff: normalizeCellText(tariffMatch?.[1] ?? null),
    month: normalizeCellText(monthMatch?.[1] ?? null),
  }
}

export function detectBranch(objectName: string): string {
  const value = objectName.toLowerCase()

  if (value.includes('вуктыл')) return 'СГГФ'
  if (value.includes('иркутск') || value.includes('красноярск') || value.includes('восток')) return 'ВГГФ'
  if (value.includes('томск')) return 'ТГГФ'
  if (value.includes('кубань') || value.includes('астрахань') || value.includes('мосгаз') || value.includes('оренбург')) return 'ОГГФ'

  return '-'
}

export function parseSatelliteAmount(value: string): number {
  const normalized = value.replace(/\s+/g, '').replace(',', '.')
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

export function parseSatelliteRowsFromBuffer(buffer: ArrayBuffer): SatelliteRow[] {
  const decoder = new TextDecoder('windows-1251')
  const xmlText = decoder.decode(buffer)
  const parser = new DOMParser()
  const xml = parser.parseFromString(xmlText, 'application/xml')

  const parserError = xml.querySelector('parsererror')
  if (parserError) {
    throw new Error('Не удалось разобрать XML-файл')
  }

  const itemNodes = Array.from(xml.getElementsByTagName('СведТов'))

  return itemNodes.map((node, index) => {
    const getAttr = (name: string): string => normalizeCellText(node.getAttribute(name))
    const fullDescription = getAttr('НаимТов')
    const details = parseNameFields(fullDescription)

    return {
      index: Number(getAttr('НомСтр')) || index + 1,
      description: details.cleanedDescription,
      objectName: details.objectName,
      branch: detectBranch(details.objectName),
      macAddress: details.macAddress,
      tariff: details.tariff,
      month: details.month,
      unit: getAttr('НаимЕдИзм'),
      quantity: getAttr('КолТов'),
      amountWithoutVat: getAttr('СтТовБезНДС'),
    }
  })
}

export async function loadSatelliteRows(xmlUrl = './месяц.xml'): Promise<SatelliteRow[]> {
  const response = await fetch(xmlUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  return parseSatelliteRowsFromBuffer(buffer)
}

export function buildSatelliteBranchSummary(rows: SatelliteRow[]): SatelliteBranchSummaryRow[] {
  const byBranch = new Map<string, number>()

  rows.forEach((row) => {
    const branch = row.branch || '-'
    const amount = parseSatelliteAmount(row.amountWithoutVat)
    byBranch.set(branch, (byBranch.get(branch) ?? 0) + amount)
  })

  return [...byBranch.entries()]
    .map(([branch, totalWithoutVat]) => ({ branch, totalWithoutVat }))
    .sort((a, b) => a.branch.localeCompare(b.branch, 'ru'))
}