/**
 * A gap that the operator of the site must fill before it goes live (who they are, where it is hosted, how to reach them).
 * Loud on purpose: a legal text with an invented fact in it is worse than one with a hole that cannot be missed.
 * Every use can be found with a search for `ToComplete`.
 */
export default function ToComplete({ what }: { what: string }) {
  return <mark className="to-complete">[À compléter : {what}]</mark>
}
