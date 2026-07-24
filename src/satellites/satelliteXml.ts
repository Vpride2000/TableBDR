export interface SatelliteRow {
  index: number
  description: string
  objectName: string
  branch: string
  macAddress: string
  tariff: string
  tariffNote: string
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

function normalizeMonthName(value: string): string {
  const source = (value ?? '').trim().toLowerCase()

  const monthMap: Record<string, string> = {
    январе: 'январь',
    феврале: 'февраль',
    марте: 'март',
    апреле: 'апрель',
    мае: 'май',
    июне: 'июнь',
    июле: 'июль',
    августе: 'август',
    сентябре: 'сентябрь',
    октябре: 'октябрь',
    ноябре: 'ноябрь',
    декабре: 'декабрь',
  }

  return monthMap[source] ?? source
}

function monthIndexToName(monthIndex: number): string {
  const monthNames = [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
  ]

  return monthNames[monthIndex - 1] ?? ''
}

function extractMonthFromDateText(value: string): string {
  const dateRangeMatch = value.match(/(?:с\s+)?(\d{2})\.(\d{2})\.(\d{4})(?:\s+по\s+\d{2}\.\d{2}\.\d{4})?/i)
  if (dateRangeMatch) {
    return monthIndexToName(Number(dateRangeMatch[2]))
  }

  return ''
}

function extractTariffTail(sourceName: string, macAddress: string): string {
  if (!macAddress) return ''

  const normalizedSource = normalizeMacText(sourceName)
  const macIndex = normalizedSource.toUpperCase().indexOf(macAddress.toUpperCase())
  if (macIndex < 0) return ''

  const tailStart = macIndex + macAddress.length
  const tail = sourceName.slice(tailStart)
  const commaIndex = tail.indexOf(',')
  const rawValue = commaIndex >= 0 ? tail.slice(commaIndex + 1) : tail

  return rawValue.replace(/\s+/g, ' ').trim().replace(/^,\s*/, '')
}

function splitTariffAndNote(value: string): { tariff: string; tariffNote: string } {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return {
      tariff: '',
      tariffNote: '',
    }
  }

  const tariffMatch = normalized.match(/\d+\s*Кбит\/с/i)
  if (!tariffMatch || tariffMatch.index == null) {
    return {
      tariff: '',
      tariffNote: normalized,
    }
  }

  const tariff = tariffMatch[0].replace(/\s+/g, ' ').trim()
  const afterTariff = normalized.slice(tariffMatch.index + tariffMatch[0].length).trim()

  return {
    tariff,
    tariffNote: afterTariff.replace(/^[,;:\-]+\s*/, ''),
  }
}

function extractTariffFromSource(sourceName: string): string {
  const normalized = sourceName.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  // Тариф чаще находится до MAC, поэтому ищем его по всей строке.
  const strictMatch = normalized.match(/(\d+(?:[.,]\d+)?\s*[КкKkМмMm]\s*бит\s*\/\s*[СсCc])/)
  if (strictMatch) {
    return strictMatch[1]
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .trim()
  }

  // Fallback на более широкий паттерн, если в строке нестандартные пробелы/регистр.
  const fallbackMatch = normalized.match(/(\d+(?:[.,]\d+)?\s*[^\s,]{0,4}бит\s*\/\s*[^\s,]{1,3})/iu)
  if (!fallbackMatch) return ''

  return fallbackMatch[1]
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

function detectFileMonth(rows: Array<{ month: string }>): string {
  const counts = new Map<string, number>()

  rows.forEach((row) => {
    if (!row.month) return
    counts.set(row.month, (counts.get(row.month) ?? 0) + 1)
  })

  let selectedMonth = ''
  let selectedCount = 0

  counts.forEach((count, month) => {
    if (count > selectedCount) {
      selectedMonth = month
      selectedCount = count
    }
  })

  return selectedMonth
}

function parseNameFields(sourceName: string): {
  cleanedDescription: string
  objectName: string
  macAddress: string
  tariff: string
  tariffNote: string
  month: string
} {
  const macNormalized = normalizeMacText(sourceName)

  const objectMatch = sourceName.match(/на направлении\s+"([^"]+)"/i)
  const macMatch = macNormalized.match(/([0-9A-F]{2}(?::[0-9A-F]{2}){5})/i)
  const monthMatch = sourceName.match(/в\s+([А-Яа-яЁё]+)\s+\d{4}\s*г\./i)
  const macAddress = normalizeCellText(macMatch?.[1] ?? null)
  const tariff = extractTariffFromSource(sourceName)
  const tariffTail = extractTariffTail(sourceName, macAddress)
  const tariffParts = splitTariffAndNote(tariffTail)
  const month = normalizeMonthName(normalizeCellText(monthMatch?.[1] ?? null)) || extractMonthFromDateText(sourceName)

  const cleaned = sourceName
    .replace(/Ежемесячная оплата за предоставление услуги передачи данных/gi, '')
    .replace(/через\s+КА\s+"Ямал-401"\s+с\s+максимально\s+возможной\s+скоростью/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    cleanedDescription: cleaned,
    objectName: normalizeCellText(objectMatch?.[1] ?? null),
    macAddress,
    tariff: tariff || tariffParts.tariff,
    tariffNote: tariffParts.tariffNote,
    month,
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

function parseSatelliteQuantity(value: string): number {
  const normalized = value.replace(/\s+/g, '').replace(',', '.')
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

function normalizeMacKey(value: string): string {
  return normalizeMacText(value).replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

function formatAmountForCell(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function aggregateSatelliteRowsByMac(rows: SatelliteRow[]): SatelliteRow[] {
  type Bucket = {
    row: SatelliteRow
    total: number
    quantityTotal: number
    order: number
  }

  const byKey = new Map<string, Bucket>()

  rows.forEach((row, index) => {
    const macKey = normalizeMacKey(row.macAddress)
    const key = macKey || `__row_${index}`
    const amount = parseSatelliteAmount(row.amountWithoutVat)
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, {
        row: { ...row },
        total: amount,
        quantityTotal: parseSatelliteQuantity(row.quantity),
        order: index,
      })
      return
    }

    existing.total += amount
    existing.quantityTotal += parseSatelliteQuantity(row.quantity)
    if (!existing.row.branch && row.branch) existing.row.branch = row.branch
    if (!existing.row.tariff && row.tariff) existing.row.tariff = row.tariff
    if (!existing.row.tariffNote && row.tariffNote) existing.row.tariffNote = row.tariffNote
    if (!existing.row.month && row.month) existing.row.month = row.month
  })

  return [...byKey.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ row, total, quantityTotal }) => {
      const nextRow: SatelliteRow = {
        ...row,
        amountWithoutVat: formatAmountForCell(total),
        quantity: Number.isInteger(quantityTotal)
          ? String(quantityTotal)
          : String(quantityTotal).replace('.', ','),
      }

      return nextRow
    })
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
  const rows = itemNodes.map((node, index) => {
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
      tariffNote: details.tariffNote,
      month: details.month,
      unit: getAttr('НаимЕдИзм'),
      quantity: getAttr('КолТов'),
      amountWithoutVat: getAttr('СтТовБезНДС'),
    }
  })

  const fileMonth = detectFileMonth(rows)
  if (!fileMonth) {
    return rows
  }

  return rows.map((row) => ({
    ...row,
    month: row.month || fileMonth,
  }))
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