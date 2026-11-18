import { and, asc, count, desc, eq, isNull, lte, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { ConflictError, type Contact, type ContactNote, type ContactQuery, type ContactRepository, type Page } from '@velocity/cms-core';
import type { Db } from './database.js';
import { contactNotes, contacts } from './tables.js';

type Row = typeof contacts.$inferSelect;

const toContact = ({ name, phone, sourceFormId, sourcePage, ownerId, followUpAt, data, ...row }: Row): Contact => ({
  ...row,
  ...(name !== null && { name }),
  ...(phone !== null && { phone }),
  ...(sourceFormId !== null && { source: { formId: sourceFormId, ...(sourcePage !== null && { page: sourcePage }) } }),
  ...(ownerId !== null && { ownerId }),
  ...(followUpAt !== null && { followUpAt }),
  ...(data !== null && { data }),
});

const toRow = ({ source, ...contact }: Contact): Row => ({
  ...contact,
  name: contact.name ?? null,
  phone: contact.phone ?? null,
  sourceFormId: source?.formId ?? null,
  sourcePage: source?.page ?? null,
  ownerId: contact.ownerId ?? null,
  followUpAt: contact.followUpAt ?? null,
  data: contact.data ?? null,
});

/** The words as a pattern that matches them anywhere, with nothing in them read as a wildcard. */
const containing = (words: string): string => `%${words.toLowerCase().replace(/[\\%_]/g, (mark) => `\\${mark}`)}%`;

export class SqliteContactRepository implements ContactRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Contact | null> {
    const [row] = await this.db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    return row ? toContact(row) : null;
  }

  async getByEmail(email: string): Promise<Contact | null> {
    const [row] = await this.db.select().from(contacts).where(eq(contacts.email, email)).limit(1);
    return row ? toContact(row) : null;
  }

  async find(query: ContactQuery = {}): Promise<Page<Contact>> {
    const words = (query.search ?? '').trim();
    const conditions: (SQL | undefined)[] = [];
    if (words !== '') {
      const pattern = containing(words);
      const like = (column: SQLWrapper) => sql`lower(${column}) like ${pattern} escape '\\'`;
      conditions.push(or(like(contacts.name), like(contacts.email), like(contacts.phone)));
    }
    if (query.stage !== undefined) conditions.push(eq(contacts.stage, query.stage));
    if (query.ownerId !== undefined) conditions.push(query.ownerId === null ? isNull(contacts.ownerId) : eq(contacts.ownerId, query.ownerId));
    if (query.followUpBy !== undefined) conditions.push(lte(contacts.followUpAt, query.followUpBy));
    const where = and(...conditions);
    const order = query.followUpBy === undefined ? [desc(contacts.createdAt), asc(contacts.id)] : [asc(contacts.followUpAt), asc(contacts.id)];
    const rows = await this.db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(...order)
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const [counted] = await this.db.select({ total: count() }).from(contacts).where(where);
    return { items: rows.map(toContact), total: counted?.total ?? 0 };
  }

  async save(contact: Contact, expectedRevision: number | null): Promise<Contact> {
    // The revision check, the email check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: contacts.revision }).from(contacts).where(eq(contacts.id, contact.id)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) {
        throw new ConflictError(`Contact "${contact.id}" changed since it was read.`);
      }
      const [other] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.email, contact.email), ne(contacts.id, contact.id)))
        .limit(1);
      if (other) throw new ConflictError(`Another contact has the email "${contact.email}".`);
      const row = toRow(contact);
      await tx.insert(contacts).values(row).onConflictDoUpdate({ target: contacts.id, set: row });
    });
    return contact;
  }

  async moveStage(from: string, to: string): Promise<number> {
    const moved = await this.db.update(contacts).set({ stage: to }).where(eq(contacts.stage, from)).returning({ id: contacts.id });
    return moved.length;
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(contactNotes).where(eq(contactNotes.contactId, id));
      await tx.delete(contacts).where(eq(contacts.id, id));
    });
  }

  async notes(contactId: string): Promise<ContactNote[]> {
    return this.db.select().from(contactNotes).where(eq(contactNotes.contactId, contactId)).orderBy(desc(contactNotes.createdAt), asc(contactNotes.id));
  }

  async addNote(note: ContactNote): Promise<ContactNote> {
    const added = await this.db.insert(contactNotes).values(note).onConflictDoNothing().returning({ id: contactNotes.id });
    if (added.length === 0) throw new ConflictError(`Note "${note.id}" already exists.`);
    return note;
  }

  async removeNote(contactId: string, noteId: string): Promise<void> {
    await this.db.delete(contactNotes).where(and(eq(contactNotes.id, noteId), eq(contactNotes.contactId, contactId)));
  }
}
