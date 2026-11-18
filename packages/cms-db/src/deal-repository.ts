import { and, asc, count, desc, eq, isNull, sum, type SQL } from 'drizzle-orm';
import { ConflictError, type Deal, type DealQuery, type DealRepository, type Page, type StageTotal } from '@velocity/cms-core';
import type { Db } from './database.js';
import { deals } from './tables.js';

type Row = typeof deals.$inferSelect;

const toDeal = ({ ownerId, closeOn, closedAt, data, aboutType, aboutEntry, ...row }: Row): Deal => ({
  ...row,
  ...(aboutType !== null && aboutEntry !== null && { about: { typeId: aboutType, entry: aboutEntry } }),
  ...(ownerId !== null && { ownerId }),
  ...(closeOn !== null && { closeOn }),
  ...(closedAt !== null && { closedAt }),
  ...(data !== null && { data }),
});

const toRow = ({ about, ...deal }: Deal): Row => ({ ...deal, aboutType: about?.typeId ?? null, aboutEntry: about?.entry ?? null, ownerId: deal.ownerId ?? null, closeOn: deal.closeOn ?? null, closedAt: deal.closedAt ?? null, data: deal.data ?? null });

export class SqliteDealRepository implements DealRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Deal | null> {
    const [row] = await this.db.select().from(deals).where(eq(deals.id, id)).limit(1);
    return row ? toDeal(row) : null;
  }

  async find(query: DealQuery = {}): Promise<Page<Deal>> {
    const conditions: (SQL | undefined)[] = [];
    if (query.contactId !== undefined) conditions.push(eq(deals.contactId, query.contactId));
    if (query.stage !== undefined) conditions.push(eq(deals.stage, query.stage));
    if (query.ownerId !== undefined) conditions.push(query.ownerId === null ? isNull(deals.ownerId) : eq(deals.ownerId, query.ownerId));
    if (query.about !== undefined) conditions.push(eq(deals.aboutType, query.about.typeId), eq(deals.aboutEntry, query.about.entry));
    const where = and(...conditions);
    const rows = await this.db
      .select()
      .from(deals)
      .where(where)
      .orderBy(desc(deals.createdAt), asc(deals.id))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const [counted] = await this.db.select({ total: count() }).from(deals).where(where);
    return { items: rows.map(toDeal), total: counted?.total ?? 0 };
  }

  async totals(): Promise<StageTotal[]> {
    const rows = await this.db.select({ stage: deals.stage, count: count(), value: sum(deals.value) }).from(deals).groupBy(deals.stage);
    return rows.map((row) => ({ stage: row.stage, count: row.count, value: Number(row.value ?? 0) }));
  }

  async save(deal: Deal, expectedRevision: number | null): Promise<Deal> {
    // The revision check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: deals.revision }).from(deals).where(eq(deals.id, deal.id)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) throw new ConflictError(`Deal "${deal.id}" changed since it was read.`);
      const row = toRow(deal);
      await tx.insert(deals).values(row).onConflictDoUpdate({ target: deals.id, set: row });
    });
    return deal;
  }

  async moveStage(from: string, to: string): Promise<number> {
    const moved = await this.db.update(deals).set({ stage: to }).where(eq(deals.stage, from)).returning({ id: deals.id });
    return moved.length;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(deals).where(eq(deals.id, id));
  }

  async removeOfContact(contactId: string): Promise<number> {
    const gone = await this.db.delete(deals).where(eq(deals.contactId, contactId)).returning({ id: deals.id });
    return gone.length;
  }
}
