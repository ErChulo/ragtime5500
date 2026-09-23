export function provenanceUrlText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function assertNoNavigableExternalUrl(element: HTMLElement): void {
  for (const anchor of element.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:/i.test(href)) {
      throw new Error('External HTTP(S) navigation is forbidden in Ragtime 5500.');
    }
  }
}
