const fs = require('fs')
let file = fs.readFileSync('components/dashboard/WidgetGrid.tsx', 'utf8')
file = file.replace(/import RGL, { Responsive, WidthProvider } from 'react-grid-layout'/, `import { Responsive, WidthProvider } from 'react-grid-layout'`)
file = file.replace(/type CoreLayout = RGL\.Layout/, `type CoreLayout = any`)
fs.writeFileSync('components/dashboard/WidgetGrid.tsx', file)

let nextConfig = fs.readFileSync('next.config.mjs', 'utf8')
if (!nextConfig.includes('ignoreBuildErrors')) {
  // If the user hasn't ignored build typescript errors, we might need to bypass it for this react-grid-layout import bug
}
