// `some_user name-99` → `someUserName99`. Splits on runs of non-alphanumerics and on
// lower→upper transitions, so already-camelCased input survives a round trip.
export function camelCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

// `one two some_user name-99` → `One Two Some_User Name-99`.
//
// **Capitalizes in place; it does not re-spell.** Every separator survives and nothing is
// lowercased — a word simply gets its first letter raised, wherever a word starts (the string, or
// anything that is not a letter or a digit). Unlike `camelCase` this joins nothing together, which is
// the point: its one call site is a player's Controller username (`ControllerButton`), and a name is
// displayed, not renamed — `some_user` reading as `SomeUser` is a different handle, and `McDonald`
// must not come back as `Mcdonald`.
//
// A word that starts with a digit has no letter to raise, so `name-99` keeps its `-99`.
//
// The classes are Unicode-aware (`\p{L}`, `\p{N}`, `/u`) and that is not decoration: with ASCII
// ranges, `ó` counts as a separator, so `ólaf` came back as `óLaf` — the accent uncapitalized and the
// letter *after* it raised instead. A name is the last thing to mangle.
export function pascalCase(value: string): string {
  return value.replace(
    /(^|[^\p{L}\p{N}])(\p{Ll})/gu,
    (_, start, letter) => start + letter.toUpperCase(),
  );
}
