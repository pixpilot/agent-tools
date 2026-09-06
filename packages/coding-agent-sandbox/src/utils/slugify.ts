const MAX_SLUG_LENGTH = 60;

/**
 * Turns a free-form task name into a slug that is safe for Git branch names,
 * directory names and Docker object names.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    // NFKD leaves combining accents behind; without this they become hyphens.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/u, '');

  if (slug === '') {
    throw new Error(`"${value}" does not contain any characters usable in a task name`);
  }

  return slug;
}
