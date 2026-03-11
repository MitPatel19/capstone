export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function money(n: number) {
  return `$${n.toFixed(2)}`
}

export function mapsLink(q: string) {
  const enc = encodeURIComponent(q)
  return `https://www.google.com/maps/search/?api=1&query=${enc}`
}
