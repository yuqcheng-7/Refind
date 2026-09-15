export function resolveTagFilterIds(selectedNames, availableTags) {
  const byName = new Map(availableTags.map((t) => [t.name, t.id]));
  return selectedNames.map((name) => byName.get(name)).filter(Boolean);
}
