import { TYPE_PLACES, type TypePlace } from '@velocity-astro/cms-core';
import { Segmented } from '@velocity-astro/cms-ui';
import { useMessages } from '../../messages/messages-context.js';

/**
 * Where the editor lists a single page someone makes: with the content, "Across the site", or as
 * a tab of Settings. What each place is for is said under the choices.
 */
export function TypePlacePicker({ place, onChange }: { readonly place: TypePlace; readonly onChange: (place: TypePlace) => void }) {
  const messages = useMessages();
  return (
    <Segmented
      label={messages.builder.typePlace}
      isLabelShown
      description={messages.builder.typePlaceHelp[place]}
      selected={place}
      onChange={(id) => onChange(TYPE_PLACES.find((candidate) => candidate === id) ?? 'content')}
      options={TYPE_PLACES.map((id) => ({ id, label: messages.builder.typePlaces[id] }))}
    />
  );
}
