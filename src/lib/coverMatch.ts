/** Regras para aceitar uma capa encontrada na internet (sem dependências, testadas em tests/cover-match.test.mjs). */
export const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** tira o que os players acrescentam ao título: "(Remastered 2011)", "- Ao Vivo", "[feat. X]", "(with Y)" */
export function baseTitle(t: string) {
  return normalize(
    t.replace(/\s*[([][^)\]]*(remaster|ao vivo|live|feat|with|version|vers[aã]o|edit|mix|explicit|deluxe|radio)[^)\]]*[)\]]/gi, "")
      .replace(/\s+-\s+.*(remaster|ao vivo|live|version|vers[aã]o|edit|mix|mono|stereo).*$/i, ""),
  )
}
export const firstArtist = (a: string) => normalize(a.split(/,|&| feat\.? | x | e /i)[0] || a)

/** o resultado é da mesma música? (título principal igual e artista principal contido) */
export function sameSong(title: string, artist: string, foundTitle: string, foundArtist: string) {
  const t1 = baseTitle(title), t2 = baseTitle(foundTitle)
  if (!t1 || !t2) return false
  const titleOk = t1 === t2 || (t1.length > 3 && (t2.startsWith(t1) || t1.startsWith(t2)))
  const a1 = firstArtist(artist), a2 = normalize(foundArtist)
  const artistOk = !a1 || a2.includes(a1) || a1.includes(firstArtist(foundArtist))
  return titleOk && artistOk
}
