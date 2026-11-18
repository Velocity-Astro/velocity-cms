import { liveFields, type ContactImportReport, type ContactImportRow } from '@velocity/cms-core';
import { Button, Dialog, FileButton, Select, Stack, Text, toast } from '@velocity/cms-ui';
import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { useCustomFields, useImportContacts } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { MAX_CSV_ROWS, parseCsv } from '../../lib/csv.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const NONE = ':none';
const NAME = ':name';
const EMAIL = ':email';
const PHONE = ':phone';
/** How many of the rows that were left out are listed. The count says the rest. */
const SHOWN_PROBLEMS = 20;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface Table {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** The window a file of contacts is brought in through: choose it, say what each column is, see what came of it. */
export function ImportDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const custom = liveFields(useCustomFields().data?.contact ?? []);
  const send = useImportContacts();
  const [table, setTable] = useState<Table | null>(null);
  // What each column of the file is, by the column's place: a detail of a contact, a custom field's id, or nothing.
  const [targets, setTargets] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<ContactImportReport | null>(null);

  const options = [
    { id: NONE, label: messages.contactImport.skip },
    { id: EMAIL, label: messages.contacts.email },
    { id: NAME, label: messages.contacts.name },
    { id: PHONE, label: messages.contacts.phone },
    ...custom.map((field) => ({ id: field.id, label: localized(field.label, locale) })),
  ];

  /** What a column most likely is, from its heading. Each detail is given to one column only. */
  const guessed = (headers: readonly string[]): string[] => {
    const taken = new Set<string>();
    return headers.map((header) => {
      const words = header.trim().toLowerCase();
      const field = custom.find((candidate) => candidate.key.toLowerCase() === words || localized(candidate.label, locale).toLowerCase() === words);
      const guess = field ? field.id : /mail/.test(words) ? EMAIL : /phone|mobile|tel/.test(words) ? PHONE : /name/.test(words) ? NAME : NONE;
      if (guess === NONE || taken.has(guess)) return NONE;
      taken.add(guess);
      return guess;
    });
  };

  const read = async (file: File) => {
    setProblem(null);
    const [headers, ...rows] = parseCsv(await file.text());
    if (!headers || rows.length === 0) return setProblem(messages.contactImport.emptyFile);
    if (rows.length > MAX_CSV_ROWS) return setProblem(messages.contactImport.tooManyRows(MAX_CSV_ROWS));
    setTable({ headers, rows });
    setTargets(guessed(headers));
  };

  // A detail goes to one column: choosing it for another takes it from the first.
  const choose = (column: number, target: string) => setTargets(targets.map((current, index) => (index === column ? target : current === target && target !== NONE ? NONE : current)));

  const bringIn = () => {
    if (!table) return;
    if (!targets.includes(EMAIL)) return setProblem(messages.contactImport.emailNeeded);
    setProblem(null);
    const rows: ContactImportRow[] = table.rows.map((cells) => {
      const of = (target: string) => {
        const value = cells[targets.indexOf(target)]?.trim();
        return value === undefined || value === '' ? undefined : value;
      };
      const name = of(NAME);
      const phone = of(PHONE);
      const data = Object.fromEntries(custom.flatMap((field) => (of(field.id) === undefined ? [] : [[field.id, of(field.id) ?? '']])));
      return { email: of(EMAIL) ?? '', ...(name !== undefined && { name }), ...(phone !== undefined && { phone }), ...(Object.keys(data).length > 0 && { data }) };
    });
    send.mutate(rows, {
      onSuccess: (done) => {
        setReport(done);
        toast({ title: messages.contactImport.done(done.added), tone: 'success' });
      },
      onError: (error) => toast({ title: messages.contactImport.failed, description: messageOf(error), tone: 'danger' }),
    });
  };

  return (
    <Dialog
      {...dialog}
      title={messages.contactImport.title}
      closeLabel={messages.app.dismiss}
      footer={
        report ? (
          <Button onPress={close}>{messages.contactImport.close}</Button>
        ) : (
          <>
            <Button variant="secondary" onPress={close}>
              {messages.editor.cancel}
            </Button>
            {table && (
              <Button isPending={send.isPending} onPress={bringIn}>
                {messages.contactImport.bringIn(table.rows.length)}
              </Button>
            )}
          </>
        )
      }
    >
      <Stack gap={4}>
        {!table && (
          <>
            <Text tone="secondary">{messages.contactImport.lead}</Text>
            <FileButton accept="csv" icon={FileUp} onSelect={(file) => void read(file)}>
              {messages.contactImport.chooseFile}
            </FileButton>
          </>
        )}
        {table && !report && (
          <>
            <Text tone="secondary">{messages.contactImport.matchLead(table.rows.length)}</Text>
            {table.headers.map((header, column) => (
              <Select
                key={column}
                label={messages.contactImport.column(header === '' ? String(column + 1) : header)}
                {...(table.rows[0]?.[column] !== undefined && table.rows[0][column] !== '' && { description: messages.contactImport.example(table.rows[0][column] ?? '') })}
                options={options}
                value={targets[column] ?? NONE}
                onChange={(target) => choose(column, target)}
              />
            ))}
          </>
        )}
        {problem !== null && !report && <Text tone="danger">{problem}</Text>}
        {report && (
          <>
            <Text weight="semibold">{messages.contactImport.added(report.added)}</Text>
            {report.filled > 0 && <Text tone="secondary">{messages.contactImport.filled(report.filled)}</Text>}
            {report.unchanged > 0 && <Text tone="secondary">{messages.contactImport.unchanged(report.unchanged)}</Text>}
            {report.problems.length > 0 && (
              <Stack gap={1}>
                <Text tone="danger">{messages.contactImport.leftOut(report.problems.length)}</Text>
                {report.problems.slice(0, SHOWN_PROBLEMS).map((left) => (
                  // The first row of the file is its headings, and people count rows from 1.
                  <Text key={left.row} size="sm" tone="secondary">
                    {messages.contactImport.rowProblem(left.row + 2, left.message)}
                  </Text>
                ))}
                {report.problems.length > SHOWN_PROBLEMS && (
                  <Text size="sm" tone="muted">
                    {messages.contactImport.andMore(report.problems.length - SHOWN_PROBLEMS)}
                  </Text>
                )}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Dialog>
  );
}
