-- Full-text search over published pages. A virtual table, so it is written by hand:
-- Drizzle's table definitions cannot describe FTS5.
CREATE VIRTUAL TABLE `search_documents` USING fts5(
  `id` UNINDEXED,
  `locale` UNINDEXED,
  `url` UNINDEXED,
  `title`,
  `body`,
  tokenize = 'unicode61 remove_diacritics 2'
);
