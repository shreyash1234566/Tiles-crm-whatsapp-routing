const fs = require('fs')
let file = fs.readFileSync('components/dashboard/WidgetGrid.tsx', 'utf8')
file = file.replace(/import { Responsive, WidthProvider } from 'react-grid-layout'/, `// @ts-ignore\nimport { Responsive, WidthProvider } from 'react-grid-layout'`)
fs.writeFileSync('components/dashboard/WidgetGrid.tsx', file)
