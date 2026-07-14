/**
 * Stable, accent-insensitive slug for an admin settings sub-section, derived
 * from its visible French title. Used to give each `<Panel>` a deep-link anchor
 * id AND to build matching `?section=` deep links in the command palette — both
 * sides call this on the SAME title string, so they can never drift.
 */
export function adminSectionId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
