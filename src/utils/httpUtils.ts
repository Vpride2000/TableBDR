export function formatHttpError(status: number): string {
  if (status === 504) return 'не доступен бэкэнд'
  return `HTTP ${status}`
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Неизвестная ошибка'
}
