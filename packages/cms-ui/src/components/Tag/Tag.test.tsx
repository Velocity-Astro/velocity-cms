import { render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Tag } from './Tag.js';

it('shows its words in the neutral tone by default', () => {
  render(<Tag>For sale</Tag>);
  expect(screen.getByText('For sale').className).toContain('bg-secondary');
});

it('hides its icon from screen readers, so only the words are announced', async () => {
  const { container } = render(
    <Tag tone="success" icon={Check}>
      Published
    </Tag>,
  );
  const tag = screen.getByText('Published');
  expect(tag.className).toContain('bg-success-light');
  expect(tag.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  await expectAccessible(container);
});
