import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { NotificationBadge } from '@/components/ui/NotificationBadge';

/** The one mark that exists today — the free starter pack's. Storybook serves `public/`. */
const NOTICE_URL = '/assets/notification.png';

// `size` comes from cva's `VariantProps`, which react-docgen can't resolve into controls —
// declare it here so the Playground gets its select.
const meta: Meta<typeof NotificationBadge> = {
  title: 'UI/NotificationBadge',
  component: NotificationBadge,
  args: { src: NOTICE_URL },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;

type Story = StoryObj<typeof NotificationBadge>;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ps-text/70 text-xs uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap items-end gap-6">{children}</div>
    </div>
  );
}

// Every size on one page, then the two things worth seeing about the mask: that the fill is what
// makes the mark (so overriding it re-colours the art), and that the badge is bigger than whatever
// it is anchored to — the empty deck slot it was built for is a *point*, not a box.
export const All: Story = {
  render: args => (
    <div className="flex flex-col gap-8">
      <Group label="Sizes">
        <NotificationBadge {...args} size="sm" />
        <NotificationBadge {...args} size="md" />
        <NotificationBadge {...args} size="lg" />
      </Group>
      <Group label="The pulse, stopped at each end">
        <NotificationBadge {...args} size="sm" className="animate-none saturate-100" />
        <NotificationBadge {...args} size="sm" className="animate-none saturate-[2.25]" />
      </Group>
      <Group label="Over a point anchor, the way a deck carries one">
        <div className="flex size-40 items-center justify-center rounded-lg border border-ps-line border-dashed">
          {/* A 1px flex box centred on the anchor: the badge overflows it in every direction, which
              is exactly what `Deck3D` does with its `<Html>` wrapper. */}
          <div className="flex size-px items-center justify-center">
            <NotificationBadge {...args} size="md" />
          </div>
        </div>
      </Group>
    </div>
  ),
};

export const Playground: Story = {};
