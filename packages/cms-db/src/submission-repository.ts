import { and, asc, count, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import { ConflictError, type Page, type Submission, type SubmissionQuery, type SubmissionRepository, type SubmissionStatus } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { formSubmissions } from './tables.js';

type Row = typeof formSubmissions.$inferSelect;

const toSubmission = ({ email, locale, page, aboutType, aboutEntry, handledAt, handledBy, ...row }: Row): Submission => ({
  ...row,
  ...(email !== null && { email }),
  ...(locale !== null && { locale }),
  ...(page !== null && { page }),
  ...(aboutType !== null && aboutEntry !== null && { about: { typeId: aboutType, entry: aboutEntry } }),
  ...(handledAt !== null && { handledAt }),
  ...(handledBy !== null && { handledBy }),
});

const toRow = ({ about, ...submission }: Submission): Row => ({
  ...submission,
  aboutType: about?.typeId ?? null,
  aboutEntry: about?.entry ?? null,
  email: submission.email ?? null,
  locale: submission.locale ?? null,
  page: submission.page ?? null,
  handledAt: submission.handledAt ?? null,
  handledBy: submission.handledBy ?? null,
});

export class SqliteSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Submission | null> {
    const [row] = await this.db.select().from(formSubmissions).where(eq(formSubmissions.id, id)).limit(1);
    return row ? toSubmission(row) : null;
  }

  async find(query: SubmissionQuery = {}): Promise<Page<Submission>> {
    const filters: SQL[] = [];
    if (query.formId !== undefined) filters.push(eq(formSubmissions.formId, query.formId));
    if (query.status !== undefined) filters.push(eq(formSubmissions.status, query.status));
    if (query.email !== undefined) filters.push(eq(formSubmissions.email, query.email));
    if (query.before !== undefined) filters.push(lt(formSubmissions.createdAt, query.before));
    const where = filters.length > 0 ? and(...filters) : undefined;
    const rows = await this.db
      .select()
      .from(formSubmissions)
      .where(where)
      .orderBy(desc(formSubmissions.createdAt), asc(formSubmissions.id))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const [counted] = await this.db.select({ total: count() }).from(formSubmissions).where(where);
    return { items: rows.map(toSubmission), total: counted?.total ?? 0 };
  }

  async counts(formId: string): Promise<Readonly<Record<SubmissionStatus, number>>> {
    const rows = await this.db
      .select({ status: formSubmissions.status, total: count() })
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .groupBy(formSubmissions.status);
    const counts = { new: 0, handled: 0, spam: 0 };
    for (const row of rows) counts[row.status] = row.total;
    return counts;
  }

  async add(submission: Submission): Promise<Submission> {
    const added = await this.db.insert(formSubmissions).values(toRow(submission)).onConflictDoNothing().returning({ id: formSubmissions.id });
    if (added.length === 0) throw new ConflictError(`Submission "${submission.id}" already exists.`);
    return submission;
  }

  async update(submission: Submission): Promise<void> {
    await this.db.update(formSubmissions).set(toRow(submission)).where(eq(formSubmissions.id, submission.id));
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.delete(formSubmissions).where(inArray(formSubmissions.id, [...ids]));
  }

  async removeOfForm(formId: string): Promise<void> {
    await this.db.delete(formSubmissions).where(eq(formSubmissions.formId, formId));
  }
}
