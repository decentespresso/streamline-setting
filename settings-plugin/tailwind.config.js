/** @type {import('tailwindcss').Config} */
export default {
  // Scan the page/component source: all Tailwind classes live in these template strings.
  // The plugin side authors HTML in .ts template strings; the ported settings app
  // is .js under src/app. src/generated is the built bundle — a stale copy of the
  // latter at the time build:css runs, so it is deliberately not scanned.
  content: ["./src/**/*.ts", "./src/app/**/*.js"],
  // Same as the skin's tailwind.config.js: a touch screen leaves a sticky :hover on
  // whatever a finger last touched, so every `hover:` utility is wrapped in
  // @media (hover: hover). Without it settings nav rows stay lit after a drag.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // The skin got these from daisyUI; the plugin defines them as variables in
      // src/styles/skin-vars.css instead of taking the dependency for 3 classes.
      colors: {
        'base-100': 'var(--base-100)',
        'base-200': 'var(--base-200)',
        'base-300': 'var(--base-300)',
        // Literal in the skin's tailwind.config.js.
        'base-400': '#9ca3af',
        'base-500': '#6b7280',
      },
    },
  },
  plugins: [],
};
