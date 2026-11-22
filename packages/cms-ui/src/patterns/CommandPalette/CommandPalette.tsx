import { Search, type LucideIcon } from 'lucide-react';
import {
  Autocomplete,
  Dialog,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  SearchField,
  useFilter,
} from 'react-aria-components';
import {
  commandPaletteClass,
  commandPaletteContentClass,
  commandPaletteEmptyClass,
  commandPaletteHeaderClass,
  commandPaletteInputClass,
  commandPaletteItemClass,
  commandPaletteItemDetailClass,
  commandPaletteItemIconClass,
  commandPaletteItemIconSize,
  commandPaletteItemLabelClass,
  commandPaletteListClass,
  commandPaletteOverlayClass,
  commandPaletteSearchClass,
  commandPaletteSearchIconSize,
  commandPaletteSectionClass,
} from './CommandPalette.variants.js';

export interface CommandItem {
  readonly id: string;
  /** What choosing it does or where it goes: "Listings", "New listing". */
  readonly label: string;
  /** A few words at the end of the row: what kind of thing it is. */
  readonly detail?: string;
  readonly icon?: LucideIcon;
  /** Other words it is found by, which are not shown. */
  readonly keywords?: string;
}

export interface CommandGroup {
  readonly id: string;
  /** The small heading over the group: "Go to", "Create". */
  readonly label: string;
  readonly items: readonly CommandItem[];
  /**
   * Its items were already found by what was typed, somewhere the window cannot look itself (the
   * site's content, its contacts), so they are shown as they are rather than narrowed again.
   */
  readonly isFound?: boolean;
}

export interface CommandPaletteProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Names the window for screen readers: "Search and commands". */
  readonly label: string;
  /** What the box says before anything is typed, and what it is called. */
  readonly placeholder: string;
  /** Shown when nothing matches what was typed. */
  readonly emptyText: string;
  readonly groups: readonly CommandGroup[];
  /** Called with the id of what was chosen. The window closes by itself. */
  readonly onAction: (id: string) => void;
  /** Called with what is in the box each time it changes, to look for things elsewhere (`isFound`). */
  readonly onSearch?: (words: string) => void;
}

/**
 * A window to find anything by typing and go there: a box, and under it the matches in groups.
 * The arrow keys move through them and Enter chooses one.
 */
export function CommandPalette({ isOpen, onOpenChange, label, placeholder, emptyText, groups, onAction, onSearch }: CommandPaletteProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const found = new Set(groups.filter((group) => group.isFound === true).flatMap((group) => group.items.map((item) => item.id)));
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={commandPaletteOverlayClass}>
      <Modal className={commandPaletteClass}>
        <Dialog aria-label={label} className={commandPaletteContentClass}>
          {({ close }) => (
            <Autocomplete
              filter={(text, words, node) => found.has(String(node.key)) || contains(text, words)}
              {...(onSearch !== undefined && { onInputChange: onSearch })}
            >
              <SearchField aria-label={placeholder} autoFocus className={commandPaletteSearchClass}>
                <Search aria-hidden size={commandPaletteSearchIconSize} />
                <Input placeholder={placeholder} className={commandPaletteInputClass} />
              </SearchField>
              <Menu
                aria-label={label}
                className={commandPaletteListClass}
                renderEmptyState={() => <div className={commandPaletteEmptyClass}>{emptyText}</div>}
                onAction={(key) => {
                  close();
                  onAction(String(key));
                }}
              >
                {groups
                  .filter((group) => group.items.length > 0)
                  .map((group) => (
                    <MenuSection key={group.id} id={group.id} className={commandPaletteSectionClass}>
                      <Header className={commandPaletteHeaderClass}>{group.label}</Header>
                      {group.items.map(({ id, label: words, detail, icon: Icon, keywords }) => (
                        <MenuItem
                          key={id}
                          id={id}
                          className={commandPaletteItemClass}
                          textValue={[words, detail, keywords].filter((part) => part !== undefined).join(' ')}
                        >
                          {Icon && (
                            <span aria-hidden className={commandPaletteItemIconClass}>
                              <Icon size={commandPaletteItemIconSize} />
                            </span>
                          )}
                          <span className={commandPaletteItemLabelClass}>{words}</span>
                          {detail !== undefined && <span className={commandPaletteItemDetailClass}>{detail}</span>}
                        </MenuItem>
                      ))}
                    </MenuSection>
                  ))}
              </Menu>
            </Autocomplete>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
