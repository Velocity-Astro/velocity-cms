import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { ConflictError, type FormDef, type FormRepository } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { forms } from './tables.js';

export class SqliteFormRepository implements FormRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<FormDef | null> {
    const [row] = await this.db.select({ definition: forms.definition }).from(forms).where(eq(forms.id, id)).limit(1);
    return row?.definition ?? null;
  }

  async getByKey(key: string): Promise<FormDef | null> {
    const [row] = await this.db
      .select({ definition: forms.definition })
      .from(forms)
      .where(and(eq(forms.key, key), isNull(forms.deletedAt)))
      .limit(1);
    return row?.definition ?? null;
  }

  async list(options: { readonly trashed?: boolean } = {}): Promise<FormDef[]> {
    const rows = await this.db
      .select({ definition: forms.definition })
      .from(forms)
      .where(options.trashed === true ? isNotNull(forms.deletedAt) : isNull(forms.deletedAt))
      .orderBy(asc(forms.key), asc(forms.id));
    return rows.map((row) => row.definition);
  }

  async save(form: FormDef, expectedRevision: number | null): Promise<FormDef> {
    // The revision check, the key check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: forms.revision }).from(forms).where(eq(forms.id, form.id)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) {
        throw new ConflictError(`Form "${form.id}" changed since it was read.`);
      }
      if (form.deletedAt === undefined) {
        const [other] = await tx
          .select({ id: forms.id })
          .from(forms)
          .where(and(eq(forms.key, form.key), isNull(forms.deletedAt), ne(forms.id, form.id)))
          .limit(1);
        if (other) throw new ConflictError(`Another form already uses the key "${form.key}".`);
      }
      const row = { id: form.id, key: form.key, revision: form.revision, definition: form, deletedAt: form.deletedAt ?? null };
      await tx.insert(forms).values(row).onConflictDoUpdate({ target: forms.id, set: row });
    });
    return form;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(forms).where(eq(forms.id, id));
  }
}
