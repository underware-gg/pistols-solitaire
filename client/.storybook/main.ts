import type { StorybookConfig } from '@storybook/nextjs-vite';

//
// Storybook is the wallet-free preview surface for the `components/ui/` primitives — a
// place to see every variant of a component at once without a chain, a Controller or a
// route. The Next.js + Vite framework reuses the app's own tsconfig path aliases (`@/*`)
// and its PostCSS/Tailwind pipeline, so a story renders exactly what the app renders.
//
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  // Unlike `next dev`, the builder does not serve `public/` on its own — and `main.css`
  // reaches into it for the self-hosted fonts and the felt's logo stamp.
  staticDirs: ['../public'],
};

export default config;
