import type { Preview } from '@storybook/nextjs-vite';
import '../src/styles/main.css';

//
// The app's one stylesheet is the only setup a story needs: `main.css` puts the felt, the
// logo stamp and the viewport vignette on `<html>`/`<body>`, which the preview iframe gets
// for free — so a primitive is previewed on the same surface it sits on in the app. No
// background decorator, and nothing here that re-decides a token.
//
const preview: Preview = {
  parameters: {
    layout: 'centered',
  },
};

export default preview;
