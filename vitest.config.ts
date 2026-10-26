import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Investigation reproducers assert existing defects; keep them out of the
    // normal regression suite. They have their own explicit configuration.
    exclude: [...configDefaults.exclude, 'analysis/**'],
  },
});
