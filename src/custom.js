// premium: your own names and colours. The chat's numbers stay as they are; only what they're
// called and how they look changes.

/** The stats with everyone renamed (names: { name in the chat → what to call them }). */
export function rename(S, names) {
  const n = (x) => names[x]?.trim() || x
  const said = (m) => m && { ...m, author: n(m.author) }
  const m = S.moments
  return {
    ...S,
    people: S.people.map((p) => ({ ...p, name: n(p.name) })),
    first: said(S.first),
    starters: S.starters.map(n),
    moments: m && {
      first: { love: said(m.first.love), laugh: said(m.first.laugh) },
      counts: Object.fromEntries(Object.entries(m.counts).map(([id, c]) => [id, Object.fromEntries(Object.entries(c).map(([k, v]) => [n(k), v]))])),
      silence: m.silence && { ...m.silence, breaker: n(m.silence.breaker) },
    },
  }
}

/** The theme with your colours for its people (colors: one per person, or empty for the theme's). */
export function recolor(theme, colors) {
  if (!colors?.some(Boolean)) return theme
  return { ...theme, people: theme.people.map((c, i) => colors[i] || c) }
}
