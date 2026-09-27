// Single source of truth for supported languages. Ids are Judge0's
// language_id values. `Language` is derived from the keys, so adding a
// language here updates the type in every workspace that imports it.
export const LANGUAGE_IDS = {
  cpp: 54,
  c: 50,
  java: 62,
  python: 71,
  javascript: 63,
} as const;

export type Language = keyof typeof LANGUAGE_IDS;
