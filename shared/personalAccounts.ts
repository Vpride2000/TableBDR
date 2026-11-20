export function personalAccountOptions(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(/\r?\n/).map((account) => account.trim()).filter(Boolean))]
}
