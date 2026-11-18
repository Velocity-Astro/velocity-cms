import type { ContentTypeDef, FieldSection } from '@velocity-astro/cms-core';
import { Button, Checkbox, Dialog, Form, Repeater, Stack, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { useSetSections } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { typeKeyFrom } from '../../lib/keys.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useClosing } from '../../lib/use-closing.js';

/** One section while it is being written: a new one has no key yet. */
interface Draft {
  readonly id: string;
  readonly section: FieldSection | null;
  readonly name: string;
  readonly aside: boolean;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A key for a new section, from its name, that no other section has. */
function freeKey(name: string, taken: ReadonlySet<string>): string {
  const base = typeKeyFrom(name) || 'section';
  let key = base;
  for (let count = 2; taken.has(key); count += 1) key = `${base}-${count}`;
  return key;
}

/** The panel a type's sections are named, ordered, added and removed in. */
export function SectionsDialog({ type, onClose }: { readonly type: ContentTypeDef; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const language = locale.split('-')[0] ?? locale;
  const save = useSetSections();
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    (type.sections ?? []).map((section) => ({ id: section.key, section, name: localized(section.label, locale), aside: section.aside === true })),
  );
  const [added, setAdded] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const change = (id: string, next: Partial<Draft>) => setDrafts((all) => all.map((draft) => (draft.id === id ? { ...draft, ...next } : draft)));

  const send = () => {
    if (drafts.some((draft) => draft.name.trim() === '')) return setProblem(messages.builder.sectionNameNeeded);
    setProblem(null);
    const taken = new Set(drafts.flatMap((draft) => draft.section?.key ?? []));
    const sections = drafts.map((draft): FieldSection => {
      const key = draft.section?.key ?? freeKey(draft.name, taken);
      taken.add(key);
      return {
        key,
        label: { ...draft.section?.label, [language]: draft.name.trim() },
        fieldIds: draft.section?.fieldIds ?? [],
        ...(draft.aside && { aside: true }),
      };
    });
    save.mutate(
      { typeId: type.id, sections },
      {
        onSuccess: () => {
          toast({ title: messages.builder.sectionsSaved, tone: 'success' });
          close();
        },
        onError: (error) => {
          setProblem(messageOf(error));
          toast({ title: messages.builder.sectionsNotSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      placement="side"
      title={messages.builder.sectionsTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={save.isPending} onPress={send}>
            {messages.builder.sectionsSave}
          </Button>
        </>
      }
    >
      <Form label={messages.builder.sectionsTitle} gap={4} onSubmit={send}>
        <Text size="sm" tone="muted">
          {messages.builder.sectionsDescription}
        </Text>
        <Repeater
          label={messages.builder.sections}
          items={drafts.map((draft, index) => ({
            id: draft.id,
            content: (
              <Stack gap={2}>
                <TextField label={messages.builder.sectionName(index + 1)} isLabelHidden value={draft.name} onChange={(name) => change(draft.id, { name })} autoComplete="off" />
                <Checkbox label={messages.builder.sectionAsideLabel} isSelected={draft.aside} onChange={(aside) => change(draft.id, { aside })} />
              </Stack>
            ),
          }))}
          emptyText={messages.builder.sectionsEmpty}
          addLabel={messages.builder.sectionAdd}
          onAdd={() => {
            setDrafts((all) => [...all, { id: `new-${added}`, section: null, name: '', aside: false }]);
            setAdded(added + 1);
          }}
          onRemove={(index) => setDrafts((all) => all.filter((_, at) => at !== index))}
          onMove={(from, to) =>
            setDrafts((all) => {
              const next = [...all];
              next.splice(to, 0, ...next.splice(from, 1));
              return next;
            })
          }
          removeLabel={messages.builder.sectionRemove}
          moveUpLabel={messages.builder.sectionMoveUp}
          moveDownLabel={messages.builder.sectionMoveDown}
          {...(problem !== null && { errorMessage: problem })}
        />
      </Form>
    </Dialog>
  );
}
