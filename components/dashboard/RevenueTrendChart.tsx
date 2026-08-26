'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush
} from 'recharts'
import { cn } from '@/lib/utils'

interface RevenueTrendChartProps {
  data: Array<{
    period: string
    revenue: number
    previousPeriod?: number
  }>
  comparison?: boolean
  className?: string
  height?: number
}

export function RevenueTrendChart({
  data,
  comparison = false,
  className,
  height = 300
}: RevenueTrendChartProps) {
  const hasComparison = comparison && data.some(d => d.previousPeriod !== undefined && d.previousPeriod !== null)

  const chartData = data.map(d => ({
    period: d.period,
    current: d.revenue,
    previous: d.previousPeriod || 0
  }))

  if (chartData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const maxValue = Math.max(
    ...chartData.map(d => Math.max(d.current, d.previous)),
    1
  )

  const formatValue = (value: number) => {
    if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`
    if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`
    if (value >= 1e3) return `₹${(value / 1e3).toFixed(1)}K`
    return `₹${value.toLocaleString()}`
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Revenue Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[{height}px] w-full" style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPrevious" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatValue}
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
                  formatValue(typeof value === 'number' ? value : 0),
                  name === 'current' ? 'Current Period' : 'Previous Period'
                ]}
              />
              <Legend
                wrapperStyle={{ paddingTop: '10px' }}
                layout="horizontal"
                align="center"
              />
              <Area
                type="monotone"
                dataKey="current"
                name="Current Period"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCurrent)"
                isAnimationActive={true}
              />
              {hasComparison && (
                <Area
                  type="monotone"
                  dataKey="previous"
                  name="Previous Period"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#colorPrevious)"
                  isAnimationActive={true}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}