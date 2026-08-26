sed -i '/import { WidthProvider/d' components/dashboard/WidgetGrid.tsx
sed -i 's/import {.*Responsive.*} from .react-grid-layout./import RGL from '\''react-grid-layout'\''\nconst { Responsive, WidthProvider } = RGL/g' components/dashboard/WidgetGrid.tsx
sed -i "s/import type { Layout as CoreLayout } from 'react-grid-layout'/type CoreLayout = RGL.Layout/" components/dashboard/WidgetGrid.tsx
