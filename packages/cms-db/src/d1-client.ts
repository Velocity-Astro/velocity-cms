import type { Client, InArgs, InStatement, ResultSet, Row, Transaction } from '@libsql/client';
import { ConflictError } from '@velocity-astro/cms-core';

/** The part of a Cloudflare D1 binding this uses. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  raw(options: { columnNames: true }): Promise<unknown[][]>;
  run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  /** Every statement or none: one that fails takes the others back. */
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

const READS = /^\s*(select|with|pragma|explain)\b/i;
const RETURNS = /\breturning\b/i;
const HOLDS_OPEN = /^\s*(begin|commit|rollback|savepoint|release)\b/i;

/**
 * What a guard evaluates when what it guards has changed: SQLite refuses to take the absolute
 * value of the smallest integer, and a statement that fails takes its whole batch back.
 */
const REFUSE = 'abs(-9223372036854775808)';

const bound = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.valueOf();
  return value;
};

/** A row as the libSQL client hands one over: read by place and by column name. */
function rowOf(columns: readonly string[], values: readonly unknown[]): Row {
  const row = {} as Record<string | number, unknown>;
  values.forEach((value, index) => Object.defineProperty(row, index, { value, enumerable: false }));
  Object.defineProperty(row, 'length', { value: values.length, enumerable: false });
  columns.forEach((column, index) => {
    if (!Object.hasOwn(row, column)) Object.defineProperty(row, column, { value: values[index], enumerable: true, configurable: true, writable: true });
  });
  return row as unknown as Row;
}

function resultOf(columns: string[], rows: Row[], rowsAffected: number, lastInsertRowid: bigint | undefined): ResultSet {
  return { columns, columnTypes: columns.map(() => ''), rows, rowsAffected, lastInsertRowid, toJSON: () => ({ columns, rows, rowsAffected }) };
}

const read = (rows: unknown[][]): ResultSet => {
  const [columns = [], ...values] = rows as [string[], ...unknown[][]];
  return resultOf(columns, values.map((one) => rowOf(columns, one)), 0, undefined);
};

const parts = (statement: InStatement | string, args?: InArgs): { sql: string; args: unknown[] } => {
  const sql = typeof statement === 'string' ? statement : statement.sql;
  const given = (typeof statement === 'string' ? args : statement.args) ?? [];
  if (!Array.isArray(given)) throw new Error('Named arguments are not supported on D1.');
  return { sql, args: given.map(bound) };
};

/** One value that says what a read answered, worked out by the database itself so it can be asked again. */
const fingerprint = (sql: string, columns: readonly string[]): string => {
  if (new Set(columns).size !== columns.length) {
    throw new Error(`A read inside a transaction on D1 must name each column once: ${columns.join(', ')}.`);
  }
  const named = columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(', ');
  return `SELECT json_group_array(json_array(${named})) FROM (${sql.trim().replace(/;$/, '')})`;
};

/**
 * A Cloudflare D1 database, spoken to as the libSQL client the rest of the package uses.
 *
 * D1 has no transaction a program can hold open: it takes a batch of statements, all or none.
 * `transaction()` here is made from that. Reads are answered at once. Writes wait, and are sent
 * together on `commit`, so either every one is kept or none is. Each read is asked again inside
 * that batch, and the batch is refused when one answers differently: what a transaction decided
 * from was still true when its writes were kept, which is what a held transaction promises.
 *
 * A write inside a transaction therefore answers nothing useful (no rows, no count) until the
 * commit, and one that asks for rows back (`RETURNING`) is refused. Every transaction in this
 * package reads first and writes last, and asks nothing of its writes.
 */
export function d1Client(database: D1Binding): Client {
  const prepared = (one: { sql: string; args: unknown[] }): D1Statement =>
    one.args.length > 0 ? database.prepare(one.sql).bind(...one.args) : database.prepare(one.sql);

  const execute = async (statement: InStatement | string, args?: InArgs): Promise<ResultSet> => {
    const one = parts(statement, args);
    if (HOLDS_OPEN.test(one.sql)) throw new Error('D1 holds no transaction open. Use transaction() or batch().');
    if (READS.test(one.sql) || RETURNS.test(one.sql)) return read(await prepared(one).raw({ columnNames: true }));
    const { meta } = await prepared(one).run();
    return resultOf([], [], meta.changes ?? 0, meta.last_row_id === undefined ? undefined : BigInt(meta.last_row_id));
  };

  const batch = async (statements: Array<InStatement | string>): Promise<ResultSet[]> => {
    const all = statements.map((statement) => parts(statement));
    const answers = (await database.batch(all.map(prepared))) as Array<{ results?: unknown[]; meta?: { changes?: number; last_row_id?: number } }>;
    return answers.map((answer) =>
      resultOf([], [], answer.meta?.changes ?? 0, answer.meta?.last_row_id === undefined ? undefined : BigInt(answer.meta.last_row_id)),
    );
  };

  const transaction = async (): Promise<Transaction> => {
    let closed = false;
    const guards: Array<{ sql: string; args: unknown[] }> = [];
    const writes: Array<{ sql: string; args: unknown[] }> = [];

    const inside = async (statement: InStatement | string, args?: InArgs): Promise<ResultSet> => {
      if (closed) throw new Error('This transaction is over.');
      const one = parts(statement, args);
      if (HOLDS_OPEN.test(one.sql)) throw new Error('A transaction inside a transaction is not supported on D1.');
      if (READS.test(one.sql)) {
        if (writes.length > 0) throw new Error('A transaction on D1 reads before it writes: a read cannot see a write that is waiting.');
        const answered = read(await prepared(one).raw({ columnNames: true }));
        // Asked a second time for its fingerprint, which the commit compares inside its batch.
        const asks = fingerprint(one.sql, answered.columns);
        const [, [was] = []] = await prepared({ sql: asks, args: one.args }).raw({ columnNames: true });
        guards.push({ sql: `SELECT CASE WHEN (${asks}) IS ? THEN 1 ELSE ${REFUSE} END`, args: [...one.args, was ?? null] });
        return answered;
      }
      if (RETURNS.test(one.sql)) throw new Error('A write inside a transaction on D1 cannot ask for rows back (RETURNING).');
      writes.push(one);
      return resultOf([], [], 0, undefined);
    };

    return {
      execute: inside,
      batch: async (statements: Array<InStatement | string>) => {
        const results: ResultSet[] = [];
        for (const statement of statements) results.push(await inside(statement));
        return results;
      },
      executeMultiple: async () => {
        throw new Error('executeMultiple is not supported on D1.');
      },
      commit: async () => {
        if (closed) return;
        closed = true;
        if (writes.length === 0) return;
        try {
          await database.batch([...guards, ...writes].map(prepared));
        } catch (error) {
          // A guard that refused says so with SQLite's own words for the value it was made to take.
          if (/integer overflow/i.test(String((error as Error | undefined)?.message ?? error))) {
            throw new ConflictError('This changed while it was being saved. Read it again and try once more.');
          }
          throw error;
        }
      },
      rollback: async () => {
        closed = true;
      },
      close: () => {
        closed = true;
      },
      get closed() {
        return closed;
      },
    } as unknown as Transaction;
  };

  return {
    execute,
    batch,
    migrate: batch,
    transaction,
    executeMultiple: async () => {
      throw new Error('executeMultiple is not supported on D1.');
    },
    sync: async () => undefined,
    close: () => undefined,
    closed: false,
    protocol: 'http',
  } as unknown as Client;
}
