'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
// @ts-ignore
import { Responsive, WidthProvider } from 'react-grid-layout'
type CoreLayout = any
import { Plus, Minus, GripVertical, X, Settings, Save, RotateCcw } from 'lucide-react'

// Use the responsive width provider
const ResponsiveGridLayout = WidthProvider(Responsive)

interface WidgetConfig {
  key: string
  title: string
  component: React.ComponentType<any>
  defaultProps?: Record<string, any>
  defaultSize?: { w: number; h: number }
  minSize?: { w: number; h: number }
  maxSize?: { w: number; h: number }
}

interface DashboardWidgetLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  static?: boolean
}

interface WidgetGridProps {
  widgets: WidgetConfig[]
  initialLayout?: DashboardWidgetLayout[]
  userId?: number
  role?: string
  onLayoutChange?: (layout: DashboardWidgetLayout[]) => void
  editable?: boolean
  className?: string
  rowHeight?: number
  cols?: { lg: number; md: number; sm: number; xs: number; xxs: number }
  breakpoints?: { lg: number; md: number; sm: number; xs: number; xxs: number }
}

// Default widget configurations
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    key: 'kpi-revenue',
    title: 'Revenue KPI',
    component: () => <div>Revenue KPI Widget</div>,
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 }
  },
  {
    key: 'kpi-pipeline',
    title: 'Pipeline KPI',
    component: () => <div>Pipeline KPI Widget</div>,
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 }
  },
  {
    key: 'kpi-cash',
    title: 'Cash Position KPI',
    component: () => <div>Cash KPI Widget</div>,
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 }
  },
  {
    key: 'kpi-conversion',
    title: 'Conversion KPI',
    component: () => <div>Conversion KPI Widget</div>,
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 }
  },
  {
    key: 'revenue-trend',
    title: 'Revenue Trend Chart',
    component: () => <div>Revenue Trend Chart</div>,
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 6 }
  },
  {
    key: 'pipeline-funnel',
    title: 'Pipeline Funnel',
    component: () => <div>Pipeline Funnel</div>,
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 6 }
  },
  {
    key: 'stock-aging',
    title: 'Stock Aging Table',
    component: () => <div>Stock Aging Table</div>,
    defaultSize: { w: 12, h: 10 },
    minSize: { w: 6, h: 8 }
  },
  {
    key: 'activity-feed',
    title: 'Activity Feed',
    component: () => <div>Activity Feed</div>,
    defaultSize: { w: 6, h: 8 },
    minSize: { w: 4, h: 6 }
  }
]

// Default layouts per breakpoint
const generateDefaultLayout = (widgets: WidgetConfig[], cols: number): DashboardWidgetLayout[] => {
  const layout: DashboardWidgetLayout[] = []
  let x = 0
  let y = 0
  let rowHeight = 0

  for (const widget of widgets) {
    const w = Math.min(widget.defaultSize?.w || 3, cols)
    const h = widget.defaultSize?.h || 4

    if (x + w > cols) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }

    layout.push({
      i: widget.key,
      x,
      y,
      w,
      h,
      minW: widget.minSize?.w,
      minH: widget.minSize?.h,
      maxW: widget.maxSize?.w,
      maxH: widget.maxSize?.h
    })

    x += w
    rowHeight = Math.max(rowHeight, h)
  }

  return layout
}

export function WidgetGrid({
  widgets = DEFAULT_WIDGETS,
  initialLayout,
  userId,
  role,
  onLayoutChange,
  editable = true,
  className,
  rowHeight = 30,
  cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 },
  breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
}: WidgetGridProps) {
  // Generate layout key for persistence
  const layoutKey = userId ? `dashboard-layout-${userId}` : `dashboard-layout-role-${role || 'default'}`

  // Load saved layout from localStorage
  const [savedLayouts, setSavedLayouts] = useState<Record<string, DashboardWidgetLayout[]> | null>(null)
  const [layout, setLayout] = useState<DashboardWidgetLayout[]>(() => {
    if (initialLayout) return initialLayout
    return generateDefaultLayout(widgets, cols.lg)
  })
  const [isEditing, setIsEditing] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [selectedWidgetKey, setSelectedWidgetKey] = useState<string | null>(null)

  // Load saved layout on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(layoutKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setSavedLayouts(parsed)
        // Merge with current widgets (in case new widgets were added)
        const merged = mergeLayouts(parsed.lg || [], layout, widgets)
        setLayout(merged)
      }
    } catch (e) {
      console.warn('Failed to load saved layout:', e)
    }
  }, [layoutKey, widgets])

  // Save layout to localStorage when it changes
  useEffect(() => {
    if (savedLayouts) {
      const newLayouts = { ...savedLayouts, lg: layout }
      setSavedLayouts(newLayouts)
      localStorage.setItem(layoutKey, JSON.stringify(newLayouts))
      onLayoutChange?.(layout)
    } else {
      const newLayouts: Record<string, DashboardWidgetLayout[]> = { lg: layout }
      setSavedLayouts(newLayouts)
      localStorage.setItem(layoutKey, JSON.stringify(newLayouts))
      onLayoutChange?.(layout)
    }
  }, [layout, layoutKey, onLayoutChange, savedLayouts])

  // Merge saved layout with default layout for new widgets
  const mergeLayouts = (
    saved: DashboardWidgetLayout[],
    current: DashboardWidgetLayout[],
    availableWidgets: WidgetConfig[]
  ): DashboardWidgetLayout[] => {
    const savedKeys = new Set(saved.map(l => l.i))
    const currentKeys = new Set(current.map(l => l.i))
    const widgetKeys = new Set(availableWidgets.map(w => w.key))

    // Start with saved layout items that are still in available widgets
    const merged = saved.filter(l => widgetKeys.has(l.i))

    // Add any new widgets from current layout that aren't in saved
    for (const item of current) {
      if (!savedKeys.has(item.i) && widgetKeys.has(item.i)) {
        merged.push(item)
      }
    }

    return merged
  }

  const handleLayoutChange = useCallback(
    (newLayout: CoreLayout[]) => {
      setLayout(newLayout as unknown as DashboardWidgetLayout[])
    },
    []
  )

  const handleRemoveWidget = useCallback((widgetKey: string) => {
    setLayout(prev => prev.filter(l => l.i !== widgetKey))
  }, [])

  const handleAddWidget = useCallback((widgetKey: string) => {
    const widget = widgets.find(w => w.key === widgetKey)
    if (!widget) return

    // Find first available position
    const newItem: DashboardWidgetLayout = {
      i: widgetKey,
      x: 0,
      y: layout.length > 0 ? Math.max(...layout.map(l => l.y + l.h)) : 0,
      w: Math.min(widget.defaultSize?.w || 3, cols.lg),
      h: widget.defaultSize?.h || 4,
      minW: widget.minSize?.w,
      minH: widget.minSize?.h,
      maxW: widget.maxSize?.w,
      maxH: widget.maxSize?.h
    }

    setLayout(prev => [...prev, newItem])
    setShowAddWidget(false)
  }, [widgets, layout, cols.lg])

  const handleResetLayout = useCallback(() => {
    const defaultLayout = generateDefaultLayout(widgets, cols.lg)
    setLayout(defaultLayout)
    localStorage.removeItem(layoutKey)
  }, [widgets, cols.lg, layoutKey])

  const renderWidget = useCallback(
    (widgetKey: string, props: { w: number; h: number }) => {
      const widget = widgets.find(w => w.key === widgetKey)
      if (!widget) return <div>Widget not found: {widgetKey}</div>

      const Component = widget.component
      const mergedProps = { ...widget.defaultProps, ...props }

      return (
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
            {editable && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedWidgetKey(widgetKey)
                  }}
                  title="Configure"
                >
                  <Settings className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-600 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveWidget(widgetKey)
                  }}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="h-[calc(100%-2.5rem)] overflow-auto">
            <Component {...mergedProps} />
          </CardContent>
        </Card>
      )
    },
    [widgets, editable, handleRemoveWidget]
  )

  const availableWidgets = widgets.filter(w => !layout.some(l => l.i === w.key))

  return (
    <div className={cn('relative', className)}>
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Button
              variant={isEditing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="gap-1"
            >
              <GripVertical className="h-4 w-4" />
              {isEditing ? 'Done Editing' : 'Edit Layout'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddWidget(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Widget
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetLayout} className="gap-1">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Widgets: {layout.length}</span>
            <span>|</span>
            <span>Breakpoint: lg</span>
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <ResponsiveGridLayout
        className="layout"
        layouts={savedLayouts || { lg: layout }}
        onLayoutChange={handleLayoutChange}
        breakpoints={breakpoints}
        cols={cols}
        rowHeight={rowHeight}
        compactType="vertical"
        preventCollision={true}
        useCSSTransforms={true}
        draggableHandle={editable ? '.widget-drag-handle' : undefined}
        resizeHandle={editable ? '.widget-resize-handle' : undefined}
        isDraggable={editable}
        isResizable={editable}
        verticalCompact={true}
      >
        {layout.map(item => {
          const widget = widgets.find(w => w.key === item.i)
          if (!widget) return null

          return (
            <div
              key={item.i}
              data-grid={item}
              className="widget-drag-handle"
            >
              <div className="widget-resize-handle" style={{ position: 'absolute', right: 0, bottom: 0, width: '16px', height: '16px', cursor: 'se-resize' }} />
              {renderWidget(item.i, { w: item.w, h: item.h })}
            </div>
          )
        })}
      </ResponsiveGridLayout>

      {/* Add Widget Dialog */}
      <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Widget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {availableWidgets.length === 0 ? (
              <p className="text-muted-foreground text-center">All available widgets are already on the dashboard</p>
            ) : (
              <div className="grid gap-2">
                {availableWidgets.map(widget => (
                  <Button
                    key={widget.key}
                    variant="outline"
                    className="justify-start gap-3 h-auto py-3"
                    onClick={() => handleAddWidget(widget.key)}
                  >
                    <div className="flex-1 text-left">
                      <p className="font-medium">{widget.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Default size: {widget.defaultSize?.w}×{widget.defaultSize?.h}
                      </p>
                    </div>
                    <Plus className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWidget(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Widget Config Dialog */}
      {selectedWidgetKey && (
        <Dialog open={true} onOpenChange={v => !v && setSelectedWidgetKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configure Widget</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-muted-foreground">
                Widget configuration for <strong>{selectedWidgetKey}</strong>
              </p>
              <Separator />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Width (cols)</Label>
                    <Input type="number" min="1" max={cols.lg} />
                  </div>
                  <div>
                    <Label>Height (rows)</Label>
                    <Input type="number" min="1" />
                  </div>
                </div>
                <div>
                  <Label>Refresh Interval</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Manual" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="900">15 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedWidgetKey(null)}>Cancel</Button>
              <Button onClick={() => setSelectedWidgetKey(null)}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// Hook for using the widget grid in a page
export function useWidgetGrid(userId?: number, role?: string) {
  const layoutKey = userId ? `dashboard-layout-${userId}` : `dashboard-layout-role-${role || 'default'}`

  const saveLayout = useCallback((layout: DashboardWidgetLayout[]) => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify({ lg: layout }))
    } catch (e) {
      console.warn('Failed to save layout:', e)
    }
  }, [layoutKey])

  const loadLayout = useCallback((): DashboardWidgetLayout[] | null => {
    try {
      const saved = localStorage.getItem(layoutKey)
      return saved ? JSON.parse(saved).lg : null
    } catch (e) {
      console.warn('Failed to load layout:', e)
      return null
    }
  }, [layoutKey])

  const resetLayout = useCallback(() => {
    localStorage.removeItem(layoutKey)
  }, [layoutKey])

  return { saveLayout, loadLayout, resetLayout }
}