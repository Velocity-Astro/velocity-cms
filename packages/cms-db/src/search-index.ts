import { sql, type SQL } from 'drizzle-orm';
import {
  MARK_CLOSE,
  MARK_OPEN,
  markedExcerpt,
  searchWords,
  type SearchDocument,
  type SearchHit,
  type SearchIndex,
  type SearchQuery,
  type SearchResults,
} from '@velocity-astro/cms-core';
import type { Db } from './database.js';

/**
 * Search kept in the same database as the content, using SQLite's FTS5. Nothing else to run or
 * pay for, and a publish changes only the rows of the pages it touched.
 */
export class SqliteSearchIndex implements SearchIndex {
  constructor(private readonly db: Db) {}

  async put(documents: readonly SearchDocument[]): Promise<void> {
    if (documents.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const document of documents) {
        await tx.run(sql`DELETE FROM search_documents WHERE id = ${document.id}`);
        await tx.run(
          sql`INSERT INTO search_documents (id, locale, url, title, body)
              VALUES (${document.id}, ${document.locale}, ${document.url}, ${document.title}, ${document.body})`,
        );
      }
    });
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const id of ids) await tx.run(sql`DELETE FROM search_documents WHERE id = ${id}`);
    });
  }

  async count(): Promise<number> {
    const { rows } = await this.db.run(sql`SELECT count(*) AS total FROM search_documents`);
    return Number(rows[0]?.total ?? 0);
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    const match = toMatch(query.text);
    if (match === null) return { total: 0, hits: [] };
    const where: SQL =
      query.locale === undefined
        ? sql`search_documents MATCH ${match}`
        : sql`search_documents MATCH ${match} AND locale = ${query.locale}`;

    const counted = await this.db.run(sql`SELECT count(*) AS total FROM search_documents WHERE ${where}`);
    // bm25 weights follow the column order: id, locale, url, title, body. Lower is better.
    const found = await this.db.run(
      sql`SELECT id, url, title, snippet(search_documents, 4, ${MARK_OPEN}, ${MARK_CLOSE}, '…', 24) AS passage
          FROM search_documents WHERE ${where}
          ORDER BY bm25(search_documents, 0, 0, 0, 10, 1), id
          LIMIT ${query.limit ?? 10}`,
    );
    const hits: SearchHit[] = found.rows.map((row) => ({
      id: String(row.id),
      url: String(row.url),
      title: String(row.title),
      excerpt: markedExcerpt(String(row.passage)),
    }));
    return { total: Number(counted.rows[0]?.total ?? 0), hits };
  }
}

/**
 * What a visitor typed, as an FTS5 query: every word quoted, so nothing they type is read as
 * syntax, and the last one open-ended, so results appear while they are still typing.
 */
function toMatch(text: string): string | null {
  const words = searchWords(text);
  if (words.length === 0) return null;
  return words.map((word, index) => (index === words.length - 1 ? `"${word}"*` : `"${word}"`)).join(' ');
}
