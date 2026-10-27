/** Legal pages whose text is not ready: while a page is listed, its links open a notice and its route shows it too. Empty this list at launch. */
export const PENDING_LEGAL_PAGES: ReadonlySet<string> = new Set(['confidentialite', 'mentions-legales'])

export type PendingLegalPage = 'confidentialite' | 'mentions-legales'

export const PENDING_TITLE = 'En cours de rédaction'
export const PENDING_TEXT = "Cette page n'est pas encore prête : Noctune est en version bêta. Le texte sera publié avant l'ouverture au public."
