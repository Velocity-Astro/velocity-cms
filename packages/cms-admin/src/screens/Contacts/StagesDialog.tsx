import type { Pipeline, StageKind } from '@velocity/cms-core';
import { Button, Dialog, Form, Grid, Repeater, Select, Stack, Text, TextField, toast } from '@velocity/cms-ui';
import { useRef, useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useSavePipeline } from '../../client/queries.js';
import { useClosing } from '../../lib/use-closing.js';
import { useMessages } from '../../messages/messages-context.js';

/** A stage while it is being edited. `row` only tells the rows apart; `id` is set for a stage that exists. */
interface Draft {
  readonly row: string;
  readonly id?: string;
  readonly label: string;
  readonly kind: StageKind;
}

const KINDS: readonly StageKind[] = ['open', 'won', 'lost'];
const MAX_STAGES = 12;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The window the pipeline's stages are renamed, reordered, added and removed in. */
export function StagesDialog({ pipeline, onClose }: { readonly pipeline: Pipeline; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const save = useSavePipeline();
  const added = useRef(0);
  const builtIn: Readonly<Record<string, string>> = messages.contacts.stages;
  const [stages, setStages] = useState<readonly Draft[]>(() => pipeline.stages.map((stage) => ({ row: stage.id, id: stage.id, label: stage.label ?? '', kind: stage.kind })));
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});

  const change = (row: string, changes: Partial<Draft>) => setStages(stages.map((stage) => (stage.row === row ? { ...stage, ...changes } : stage)));
  const send = () => {
    setProblems({});
    save.mutate(
      { stages: stages.map(({ id, label, kind }) => ({ ...(id !== undefined && { id }), label, kind })), expectedRevision: pipeline.revision },
      {
        onSuccess: () => {
          toast({ title: messages.contacts.stagesSaved, tone: 'success' });
          close();
        },
        onError: (error) => {
          // What was typed stays; each problem goes to the row and field it names.
          if (error instanceof AdminRequestError) setProblems(Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message])));
          toast({ title: messages.contacts.stagesNotSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.contacts.editStagesTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={save.isPending} onPress={send}>
            {messages.contacts.saveStages}
          </Button>
        </>
      }
    >
      <Form label={messages.contacts.editStagesTitle} gap={4} onSubmit={send}>
        <Stack gap={1}>
          <Text tone="secondary">{messages.contacts.stagesHelp}</Text>
          <Text size="sm" tone="muted">
            {messages.contacts.stagesRemoveNote}
          </Text>
        </Stack>
        <Repeater
          label={messages.contacts.editStagesTitle}
          {...(problems['stages'] !== undefined && { errorMessage: problems['stages'] })}
          items={stages.map((stage, index) => ({
            id: stage.row,
            content: (
              <Grid columns={2} gap={3}>
                <TextField
                  label={messages.contacts.stageName}
                  value={stage.label}
                  onChange={(label) => change(stage.row, { label })}
                  autoComplete="off"
                  {...(stage.id !== undefined && builtIn[stage.id] !== undefined && { placeholder: builtIn[stage.id] })}
                  {...(problems[`stages.${index}.label`] !== undefined && { errorMessage: problems[`stages.${index}.label`] })}
                />
                <Select
                  label={messages.contacts.stageKind}
                  options={KINDS.map((kind) => ({ id: kind, label: messages.contacts.stageKinds[kind] }))}
                  value={stage.kind}
                  onChange={(kind) => change(stage.row, { kind: KINDS.find((candidate) => candidate === kind) ?? 'open' })}
                  {...(problems[`stages.${index}.kind`] !== undefined && { errorMessage: problems[`stages.${index}.kind`] })}
                />
              </Grid>
            ),
          }))}
          emptyText={messages.contacts.stagesEmpty}
          addLabel={messages.contacts.addStage}
          isFull={stages.length >= MAX_STAGES}
          onAdd={() => {
            added.current += 1;
            setStages([...stages, { row: `added-${added.current}`, label: '', kind: 'open' }]);
          }}
          onRemove={(index) => setStages(stages.filter((_, at) => at !== index))}
          onMove={(from, to) => {
            const next = [...stages];
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            setStages(next);
          }}
          removeLabel={messages.contacts.removeStage}
          moveUpLabel={messages.contacts.moveStageUp}
          moveDownLabel={messages.contacts.moveStageDown}
        />
      </Form>
    </Dialog>
  );
}
