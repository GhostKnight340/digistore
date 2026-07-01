export function customerFullName(firstName: string, lastName: string) {
  return [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

// First word -> firstName, remaining words -> lastName. Mirrors the
// backfill logic used to migrate the legacy single "name" column.
export function splitFullName(fullName: string) {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(" ") };
}
