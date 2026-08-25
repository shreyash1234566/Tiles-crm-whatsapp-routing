import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      // Turbopack can run PostCSS from the nearest parent workspace. Keep
      // Tailwind's module and source-file resolution anchored to this app.
      base: projectRoot,
    },
  },
};

export default config;
