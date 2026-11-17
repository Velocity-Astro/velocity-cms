import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import '../src/styles.css';
import './preview.css';

/** Each part's own guide (`X.md`), shown at the top of its docs page. */
const guides = import.meta.glob<string>('../src/**/*.md', { query: '?raw', import: 'default', eager: true });
const guideFor = (name: string | undefined): string | undefined => {
  const file = Object.keys(guides).find((key) => key.endsWith(`/${name}.md`));
  // The page already has the name as its title.
  return file ? guides[file]?.replace(/^# .*\n+/, '') : undefined;
};

/** Light or dark, from the toolbar. The theme is a class on the page, as in the editor. */
const withTheme: Decorator = (Story, context) => {
  const dark = context.globals['theme'] === 'dark';
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  // The surface is drawn here too, so a dark story is readable on Storybook's own white docs page.
  return (
    <div className={context.parameters['layout'] === 'fullscreen' ? 'story-surface story-surface-full' : 'story-surface'}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { icon: 'contrast', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'centered',
    docs: {
      // The built Storybook shortens function names, so the name comes from the generated docs.
      extractComponentDescription: (component: { __docgenInfo?: { displayName?: string }; name?: string } | undefined) =>
        guideFor(component?.__docgenInfo?.displayName ?? component?.name),
    },
    options: {
      storySort: { order: ['Components', ['Layout', 'Typography', 'Actions', 'Forms', 'Status', 'Data', 'Navigation', 'Overlays'], 'Patterns'] },
    },
  },
};

export default preview;
