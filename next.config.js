/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Reduce build time by skipping type checking (run separately)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Optimize images
  images: {
    unoptimized: true,
  },

  // Every host the preview iframe is served from must be listed, or Next 16
  // rejects the /_next/webpack-hmr WebSocket upgrade with a 502 and the dev
  // runtime never initializes — React stops before hydration and the page is
  // frozen on its server-rendered markup (for generated apps, SSOGuard's
  // spinner). The JS bundles themselves still load, which is what makes this
  // failure look like an app bug rather than a config one. E2B serves sandboxes
  // from BOTH domains, so both belong here: dropping .e2b.app silently bricked
  // every preview.
  allowedDevOrigins: [
    'architect.new',
    '**.architect.new',
    '**.e2b.dev',
    '**.e2b.app',
    'preview--testapp.localhost',
    'preview--testapp.localhost:8090',
  ],

  // Stable since Next.js 15 — no longer under experimental
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-accordion',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-aspect-ratio',
    '@radix-ui/react-avatar',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-collapsible',
    '@radix-ui/react-context-menu',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-hover-card',
    '@radix-ui/react-label',
    '@radix-ui/react-menubar',
    '@radix-ui/react-navigation-menu',
    '@radix-ui/react-popover',
    '@radix-ui/react-progress',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-scroll-area',
    '@radix-ui/react-select',
    '@radix-ui/react-separator',
    '@radix-ui/react-slider',
    '@radix-ui/react-slot',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-toggle',
    '@radix-ui/react-toggle-group',
    '@radix-ui/react-tooltip',
    'recharts',
    'date-fns',
  ],
}

module.exports = nextConfig
