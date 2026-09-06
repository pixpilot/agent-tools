import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/utils/slugify';

describe('slugify', () => {
  it('should lowercase and hyphenate a task name', () => {
    expect(slugify('Fix resume generation')).toBe('fix-resume-generation');
  });

  it('should collapse runs of punctuation into a single hyphen', () => {
    expect(slugify('fix -- resume__generation!!')).toBe('fix-resume-generation');
  });

  it('should trim leading and trailing separators', () => {
    expect(slugify('  /fix-resume/  ')).toBe('fix-resume');
  });

  it('should keep the slug usable as a Git ref and Docker name', () => {
    expect(slugify('Fix résumé génération')).toBe('fix-resume-generation');
  });

  it('should cap long names without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(58)} tail`);

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('should reject names with no usable characters', () => {
    expect(() => slugify('///')).toThrow(/does not contain any characters/u);
  });
});
