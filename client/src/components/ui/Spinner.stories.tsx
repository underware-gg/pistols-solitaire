import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

// `size` comes from cva's `VariantProps`, which react-docgen can't resolve into controls —
// declare it here so the Playground gets its select.
const meta: Meta<typeof Spinner> = {
  title: 'UI/Spinner',
  component: Spinner,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;

type Story = StoryObj<typeof Spinner>;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ps-text/70 text-xs uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

// Every size on one page, plus the two places it actually appears: standing in for the header's
// account button while the Controller reconnects, and inside a button that is working.
export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Group label="Sizes">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </Group>
      <Group label="Colour">
        <Spinner />
        <Spinner className="text-ps-accent" />
        <Spinner className="text-ps-text/40" />
      </Group>
      <Group label="In place of a control">
        <Button variant="ghost" disabled aria-label="Connecting">
          <Spinner size="sm" />
        </Button>
        <Button disabled>
          <Spinner size="sm" />
          Connecting…
        </Button>
      </Group>
    </div>
  ),
};

export const Playground: Story = {};
