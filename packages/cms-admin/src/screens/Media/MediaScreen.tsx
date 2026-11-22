import type { SiteImage } from '@velocity-astro/cms-core';
import { Box, Button, ConfirmDialog, Dialog, EmptyState, FileButton, Grid, Inline, MediaGrid, PageHeader, SearchField, Select, Stack, Text, Thumbnail, toast } from '@velocity-astro/cms-ui';
import { Images, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useImages, useJustUploaded, useRemoveImage, useSession, useUploadImage, useUploadRules } from '../../client/queries.js';
import { IMAGE_KINDS, IMAGE_SORTS, IMAGE_SOURCES, NEWEST_FIRST, arrangeImages, kindOf, type ImageArrangement, type ImageKind, type ImageSort, type ImageSource } from '../../lib/arrange-images.js';
import { prepareImage } from '../../lib/prepare-image.js';
import { relativeTime } from '../../lib/relative-time.js';
import { smallOf } from '../../lib/small-image.js';
import { useClosing, useLast } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** A number with at most one decimal, without a trailing `.0`. */
const short = (amount: number) => amount.toFixed(1).replace(/\.0$/, '');

/** Every image the site has: the ones it came with and the ones people uploaded. */
export function MediaScreen() {
  const messages = useMessages();
  const images = useImages();
  const rules = useUploadRules().data ?? null;
  const uploading = useUploadImage();
  const fresh = useJustUploaded();
  const [arrangement, setArrangement] = useState<ImageArrangement>(NEWEST_FIRST);
  const [openName, setOpenName] = useState<string | null>(null);
  const arrange = (changes: Partial<ImageArrangement>) => setArrangement((current) => ({ ...current, ...changes }));

  const all = images.data ?? [];
  const shown = arrangeImages(all, arrangement);
  const isNarrowed = arrangement.query.trim() !== '' || arrangement.source !== 'all' || arrangement.kind !== 'all';
  // Only the kinds of file the library holds are offered.
  const kinds = IMAGE_KINDS.filter((kind) => kind === 'all' || all.some((image) => kindOf(image) === kind));
  const hasBoth = all.some((image) => image.uploadedAt !== undefined) && all.some((image) => image.uploadedAt === undefined);
  // An image leaves the list the moment it is removed. Its window keeps showing it while it closes.
  const open = useLast(all.find((image) => image.name === openName) ?? null);
  const noteOf = (image: SiteImage) =>
    image.uploadedAt === undefined ? messages.media.fromSite : image.width !== undefined && image.height !== undefined ? messages.media.dimensions(image.width, image.height) : undefined;

  const upload = async (file: File) => {
    const prepared = await prepareImage(file, rules?.maxBytes ?? 0).catch(() => null);
    if (!prepared) {
      toast({ title: messages.media.notUploaded, description: messages.media.notRead, tone: 'danger' });
      return;
    }
    uploading.mutate(prepared, {
      onSuccess: (image) => {
        // The new image is shown first, marked, whatever the library was narrowed to.
        setArrangement(NEWEST_FIRST);
        toast({ title: messages.media.uploaded(image.name), description: messages.media.uploadedDescription, tone: 'success' });
      },
      onError: (error) => toast({ title: messages.media.notUploaded, description: messageOf(error), tone: 'danger' }),
    });
  };
  const uploadButton = (variant: 'primary' | 'secondary') =>
    rules && (
      <FileButton accept="image" icon={Upload} variant={variant} collapses={variant === 'primary'} isPending={uploading.isPending} onSelect={(file) => void upload(file)}>
        {messages.media.upload}
      </FileButton>
    );

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader
          title={messages.media.title}
          actions={uploadButton('primary')}
          {...(images.isSuccess && { description: [messages.media.description(all.length), ...(rules ? [messages.media.uploadHint(short(rules.maxBytes / 1_000_000))] : [])].join(' · ') })}
        />
        {images.isPending && <LoadingState shape="table" />}
        {images.isError && <ErrorState error={images.error} onRetry={() => void images.refetch()} />}
        {images.isSuccess && all.length === 0 && (
          <EmptyState icon={Images} title={messages.media.emptyTitle} description={rules ? messages.media.emptyDescription : messages.media.emptyNoUploads} action={uploadButton('secondary')} />
        )}
        {images.isSuccess && all.length > 0 && (
          <>
            <Grid columns={4} gap={3}>
              <SearchField
                label={messages.media.search}
                placeholder={messages.media.searchPlaceholder}
                clearLabel={messages.media.clearSearch}
                value={arrangement.query}
                onChange={(query) => arrange({ query })}
              />
              {hasBoth && (
                <Select
                  label={messages.media.source}
                  options={IMAGE_SOURCES.map((id) => ({ id, label: messages.media.sources[id] }))}
                  value={arrangement.source}
                  onChange={(id) => arrange({ source: id as ImageSource })}
                />
              )}
              {kinds.length > 2 && (
                <Select
                  label={messages.media.kind}
                  options={kinds.map((id) => ({ id, label: messages.media.kinds[id] }))}
                  value={arrangement.kind}
                  onChange={(id) => arrange({ kind: id as ImageKind })}
                />
              )}
              <Select
                label={messages.media.sort}
                options={IMAGE_SORTS.map((id) => ({ id, label: messages.media.sorts[id] }))}
                value={arrangement.sort}
                onChange={(id) => arrange({ sort: id as ImageSort })}
              />
            </Grid>
            {isNarrowed && (
              <Inline gap={3}>
                <Text size="sm" tone="muted">
                  {messages.media.shownCount(shown.length, all.length)}
                </Text>
                <Button variant="ghost" size="sm" onPress={() => arrange({ query: '', source: 'all', kind: 'all' })}>
                  {messages.media.showAll}
                </Button>
              </Inline>
            )}
            <MediaGrid
              label={messages.media.grid}
              items={shown.map((image) => {
                const note = noteOf(image);
                return {
                  id: image.name,
                  name: image.name,
                  url: smallOf(image),
                  ...(note !== undefined && { note }),
                  ...(fresh.has(image.name) && { badge: messages.media.justUploaded }),
                };
              })}
              onAction={setOpenName}
              emptyText={isNarrowed ? messages.media.noMatchesFiltered : messages.media.noMatches}
            />
          </>
        )}
      </Stack>
      {/* Made anew for each image, so it never shows the last one's details. */}
      {openName !== null && open && <ImageDialog key={openName} image={open} onClose={() => setOpenName(null)} />}
    </Box>
  );
}

/** One image up close: what it is called, how large it is, and the way to remove an upload. */
function ImageDialog({ image, onClose }: { readonly image: SiteImage; readonly onClose: () => void }) {
  const messages = useMessages();
  const locale = useLocale();
  const session = useSession();
  const remove = useRemoveImage();
  const { close, dialog } = useClosing(onClose);
  const [isAsking, setAsking] = useState(false);
  const shown = image;
  const isUpload = shown.uploadedAt !== undefined;
  // Removing cannot be undone and changes what the site shows, so it is for people who may publish.
  const mayRemove = isUpload && session.data !== null && session.data !== undefined && session.data.role !== 'author';
  const size = shown.size === undefined ? undefined : shown.size >= 1_000_000 ? messages.media.megabytes(short(shown.size / 1_000_000)) : messages.media.kilobytes(short(shown.size / 1000));

  const fact = (label: string, value: string, help?: string) => (
    <Stack gap={0}>
      <Text size="sm" tone="muted">
        {label}
      </Text>
      <Text>{value}</Text>
      {help !== undefined && (
        <Text size="sm" tone="muted">
          {help}
        </Text>
      )}
    </Stack>
  );

  return (
    <>
      <Dialog
        {...dialog}
        placement="side"
        title={shown.name}
        closeLabel={messages.app.dismiss}
        footer={
          <Inline gap={2}>
            {mayRemove && (
              <Button variant="danger" icon={Trash2} onPress={() => setAsking(true)}>
                {messages.media.remove}
              </Button>
            )}
            <Button variant="secondary" onPress={close}>
              {messages.media.close}
            </Button>
          </Inline>
        }
      >
        <Stack gap={5}>
          <Thumbnail src={shown.url} size="full" />
          {fact(messages.media.detailName, shown.name, messages.media.detailNameHelp)}
          {shown.width !== undefined && shown.height !== undefined && fact(messages.media.detailSize, messages.media.dimensions(shown.width, shown.height))}
          {size !== undefined && fact(messages.media.detailFile, size)}
          {shown.uploadedAt !== undefined ? fact(messages.media.detailUploaded, relativeTime(shown.uploadedAt, locale)) : fact(messages.media.fromSite, messages.media.fromSiteHelp)}
        </Stack>
      </Dialog>
      <ConfirmDialog
        isOpen={isAsking}
        onOpenChange={setAsking}
        title={messages.media.removeTitle(shown.name)}
        confirmLabel={messages.media.remove}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() =>
          remove.mutate(shown.name, {
            onSuccess: () => {
              toast({ title: messages.media.removed(shown.name), tone: 'success' });
              setAsking(false);
              close();
            },
            onError: (error) => {
              toast({ title: messages.media.notRemoved, description: messageOf(error), tone: 'danger' });
              setAsking(false);
            },
          })
        }
      >
        {messages.media.removeDescription}
      </ConfirmDialog>
    </>
  );
}
