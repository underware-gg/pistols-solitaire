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

// `some_user name-99` → `SomeUserName99`. Same splitting as `camelCase`, first word capitalized too.
export function pascalCase(value: string): string {
  const camel = camelCase(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}
