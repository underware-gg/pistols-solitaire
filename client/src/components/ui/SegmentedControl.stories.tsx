import type { Meta, StoryObj } from '@storybook/react';
import { Grid2x2, List } from 'lucide-react';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';

// `size` is `Button`'s axis, passed straight through, so react-docgen can't see the options —
// declare them here or the Playground loses the select.
const meta: Meta<typeof SegmentedControl<string>> = {
  title: 'UI/SegmentedControl',
  component: SegmentedControl,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof SegmentedControl<string>>;

const GAMES: SegmentedOption<string>[] = [
  { value: 'pistols', label: 'Pistols Only' },
  { value: 'all', label: 'All Games' },
];

const VIEWS: SegmentedOption<string>[] = [
  { value: 'grid', label: <Grid2x2 className="size-4" />, ariaLabel: 'Grid' },
  { value: 'list', label: <List className="size-4" />, ariaLabel: 'List' },
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-ps-text/70">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// The control is controlled, so every story owns the selection it shows.
function Demo({
  options = GAMES,
  initial = options[0].value,
  ...props
}: Omit<ComponentProps<typeof SegmentedControl<string>>, 'options' | 'value' | 'onChange'> & {
  options?: readonly SegmentedOption<string>[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return <SegmentedControl {...props} options={options} value={value} onChange={setValue} />;
}

// Every size and shape on one page, against the felt.
export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Group label="Selection (primary is picked, secondary is on offer)">
        <Demo initial="pistols" />
        <Demo initial="all" />
      </Group>
      <Group label="Sizes">
        <Demo size="sm" />
        <Demo size="md" />
        <Demo size="lg" />
      </Group>
      <Group label="Three options">
        <Demo
          options={[
            { value: 'all', label: 'All' },
            { value: 'duels', label: 'Duels' },
            { value: 'duelists', label: 'Duelists' },
          ]}
          initial="duels"
        />
      </Group>
      <Group label="Icon-only segments">
        <Demo options={VIEWS} />
      </Group>
      <Group label="Disabled">
        <Demo disabled />
      </Group>
    </div>
  ),
};

// Controls-driven, for tweaking props in the Storybook panel.
export const Playground: Story = {
  args: { label: 'Which collections' },
  render: args => <Demo {...args} />,
};
