'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import { cn } from '@/lib/utils'

interface FunnelStage {
  stage: string
  count: number
  conversionFromPrevious: number
  conversionFromStart: number
}

interface PipelineFunnelProps {
  data: FunnelStage[]
  className?: string
  height?: number
}

export function PipelineFunnel({
  data,
  className,
  height = 350
}: PipelineFunnelProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate max count for width scaling
  const maxCount = Math.max(...data.map(d => d.count), 1)

  const formatCount = (count: number) => {
    if (count >= 1e5) return `${(count / 1e5).toFixed(1)}L`
    if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`
    return count.toLocaleString()
  }

  // Color gradient from green to red based on position
  const stageColors = [
    '#22c55e', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444'  // red
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((stage, index) => {
            const widthPercent = (stage.count / maxCount) * 100
            const color = stageColors[index % stageColors.length]

            return (
              <div key={stage.stage} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{stage.stage}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-gray-900 w-16 text-right">
                      {formatCount(stage.count)}
                    </span>
                    {index > 0 && (
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          stage.conversionFromPrevious >= 50 ? 'bg-green-100 text-green-700' :
                          stage.conversionFromPrevious >= 25 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        )}
                      >
                        {stage.conversionFromPrevious.toFixed(1)}% from prev
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {stage.conversionFromStart.toFixed(1)}% overall
                    </span>
                  </div>
                </div>
                <div
                  className="relative h-8 bg-gray-100 rounded overflow-hidden"
                  style={{ width: '100%' }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: color,
                      opacity: 0.85
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: color,
                      opacity: 0
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Alternative: Horizontal bar chart using Recharts */}
        <div className="mt-6" style={{ height: `${height - 150}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.map((d, i) => ({ ...d, color: stageColors[i % stageColors.length] }))}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickFormatter={formatCount}
              />
              <YAxis
                type="category"
                dataKey="stage"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                formatter={(value: any, name: any) => [
                  formatCount(typeof value === 'number' ? value : 0),
                  name === 'count' ? 'Count' : ''
                ]}
              />
              <Bar
                dataKey="count"
                name="Count"
                radius={[0, 4, 4, 0]}
                barSize={32}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={stageColors[i % stageColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}