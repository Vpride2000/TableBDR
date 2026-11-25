const REFERENCE_ENDPOINTS = {
  departments: '/api/gn/departments',
  objects: '/api/gn/objects',
  dogovors: '/api/gn/dogovors',
  contractors: '/api/gn/contractors',
} as const

export function fetchReference(reference: keyof typeof REFERENCE_ENDPOINTS): Promise<Response> {
  return fetch(REFERENCE_ENDPOINTS[reference])
}

export function fetchReferences(...references: Array<keyof typeof REFERENCE_ENDPOINTS>): Promise<Response>[] {
  return references.map(fetchReference)
}
