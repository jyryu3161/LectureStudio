/** @type {import('next').NextConfig} */
const nextConfig = {
  // The MyST content pipeline (myst-parser and friends) ships ESM-only
  // packages. They are only ever imported from server code (route
  // handlers / server components), but Next still bundles server code
  // through webpack, so these need to be transpiled rather than treated
  // as opaque CJS externals.
  transpilePackages: [
    'myst-parser',
    'myst-to-react',
    'myst-common',
    'myst-transforms',
    'myst-directives',
    'unified',
    'unist-util-visit',
    'shiki',
  ],
};

export default nextConfig;
