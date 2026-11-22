/** The words as a pattern for `like … escape '\'` that matches them anywhere, with nothing in them read as a wildcard. */
export const containing = (words: string): string => `%${words.toLowerCase().replace(/[\\%_]/g, (mark) => `\\${mark}`)}%`;
