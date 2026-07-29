import type { Meta, StoryObj } from '@storybook/react';
import { Gift, LogOut, User, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

// `variant`/`size` come from cva's `VariantProps`, which react-docgen can't resolve into
// controls — declare them here so the Playground gets its selects.
const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'BUTTON' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'accent', 'secondary', 'ghost', 'text'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-ps-text/70">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// Every variant and size on one page — easier to eyeball against the felt than one story
// per state. The header is the reference for three of the five: `primary` is Connect,
// `ghost` the icon-only menu control, `text` the connected account; `accent` is the free
// starter pack on `/deck/packs`.
export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Group label="Variants">
        <Button variant="primary">
          <Wallet className="size-4" />
          Connect
        </Button>
        <Button variant="accent">
          <Gift className="size-4" />
          Claim Starter Pack
        </Button>
        <Button variant="secondary">
          <User className="size-4" />
          Duelist
        </Button>
        <Button variant="ghost" aria-label="Disconnect">
          <LogOut className="size-4" />
        </Button>
        <Button variant="text">Duelist</Button>
      </Group>
      <Group label="Sizes">
        <Button size="sm">small</Button>
        <Button size="md">medium</Button>
        <Button size="lg">large</Button>
      </Group>
      <Group label="Disabled">
        <Button disabled>Connecting…</Button>
        <Button variant="accent" disabled>
          Claiming…
        </Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
        <Button variant="ghost" disabled>
          Disabled
        </Button>
        <Button variant="text" disabled>
          Disabled
        </Button>
      </Group>
      <Group label="className override (merged last, wins over the variant)">
        <Button className="w-full">FULL WIDTH</Button>
      </Group>
    </div>
  ),
};

// Controls-driven single button, for tweaking props in the Storybook panel.
export const Playground: Story = { args: { children: 'CONNECT' } };
