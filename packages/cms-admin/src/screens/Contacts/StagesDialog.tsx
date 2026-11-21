import type { Pipeline, StageKind, TeamMember } from '@velocity-astro/cms-core';
import { Button, Checkbox, Dialog, Fieldset, Form, Grid, NumberField, Repeater, Select, Stack, Text, TextField, toast } from '@velocity-astro/cms-ui';
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
  readonly chance: number | null;
}

const KINDS: readonly StageKind[] = ['open', 'won', 'lost'];
const MAX_STAGES = 12;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The window the pipeline's stages are renamed, reordered, added and removed in. */
export function StagesDialog({ pipeline, team, onClose }: { readonly pipeline: Pipeline; readonly team: readonly TeamMember[]; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const save = useSavePipeline();
  const added = useRef(0);
  const builtIn: Readonly<Record<string, string>> = messages.contacts.stages;
  const [stages, setStages] = useState<readonly Draft[]>(() => pipeline.stages.map((stage) => ({ row: stage.id, id: stage.id, label: stage.label ?? '', kind: stage.kind, chance: stage.chance ?? 50 })));
  const [currency, setCurrency] = useState(pipeline.currency ?? 'USD');
  const [assignTo, setAssignTo] = useState<readonly string[]>(pipeline.assignTo ?? []);
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(pipeline.monthlyTarget ?? null);
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});

  const change = (row: string, changes: Partial<Draft>) => setStages(stages.map((stage) => (stage.row === row ? { ...stage, ...changes } : stage)));
  const send = () => {
    setProblems({});
    save.mutate(
      {
        stages: stages.map(({ id, label, kind, chance }) => ({ ...(id !== undefined && { id }), label, kind, ...(kind === 'open' && chance !== null && { chance }) })),
        currency,
        // Someone who left is dropped from the list rather than refused.
        assignTo: assignTo.filter((id) => team.some((member) => member.id === id)),
        // Emptied, there is no target.
        monthlyTarget,
        expectedRevision: pipeline.revision,
      },
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
              <Grid columns={3} gap={3}>
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
                {/* A won stage is certain and a lost one is not: only an open stage has a chance to set. */}
                {stage.kind === 'open' && (
                  <NumberField
                    label={messages.contacts.stageChance}
                    value={stage.chance}
                    onChange={(chance) => change(stage.row, { chance })}
                    minValue={0}
                    maxValue={100}
                    isInteger
                    {...(problems[`stages.${index}.chance`] !== undefined && { errorMessage: problems[`stages.${index}.chance`] })}
                  />
                )}
              </Grid>
            ),
          }))}
          emptyText={messages.contacts.stagesEmpty}
          addLabel={messages.contacts.addStage}
          isFull={stages.length >= MAX_STAGES}
          onAdd={() => {
            added.current += 1;
            setStages([...stages, { row: `added-${added.current}`, label: '', kind: 'open', chance: 50 }]);
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
        <Fieldset legend={messages.contacts.pipelineSettings}>
          <Stack gap={4}>
            <TextField
              label={messages.contacts.currency}
              description={messages.contacts.currencyHelp}
              value={currency}
              onChange={setCurrency}
              autoComplete="off"
              {...(problems['currency'] !== undefined && { errorMessage: problems['currency'] })}
            />
            <NumberField
              label={messages.contacts.monthlyTarget}
              description={messages.contacts.monthlyTargetHelp}
              value={monthlyTarget}
              onChange={(value) => setMonthlyTarget(value === null || Number.isNaN(value) ? null : value)}
              minValue={1}
              isInteger
              {...(problems['monthlyTarget'] !== undefined && { errorMessage: problems['monthlyTarget'] })}
            />
            {team.length > 0 && (
              <Fieldset legend={messages.contacts.assignTo} description={messages.contacts.assignToHelp}>
                <Stack gap={2}>
                  {team.map((member) => (
                    <Checkbox
                      key={member.id}
                      label={member.name}
                      isSelected={assignTo.includes(member.id)}
                      onChange={(isSelected) => setAssignTo(isSelected ? [...assignTo, member.id] : assignTo.filter((id) => id !== member.id))}
                    />
                  ))}
                </Stack>
              </Fieldset>
            )}
          </Stack>
        </Fieldset>
      </Form>
    </Dialog>
  );
}
