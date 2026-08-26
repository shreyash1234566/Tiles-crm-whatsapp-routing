'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  trend?: {
    value: number
    label?: string
  }
  threshold?: {
    value: number
    operator: '>' | '>=' | '<' | '<=' | '=' | '!='
    severity: 'critical' | 'warning' | 'info'
  }
  icon?: React.ReactNode
  onClick?: () => void
  className?: string
  loading?: boolean
}

export function KPICard({
  title,
  value,
  trend,
  threshold,
  icon,
  onClick,
  className,
  loading = false
}: KPICardProps) {
  const isClickable = typeof onClick === 'function'

  // Evaluate threshold if provided
  let thresholdStatus: 'normal' | 'warning' | 'critical' | 'info' = 'normal'
  let thresholdMessage = ''

  if (threshold && typeof value === 'number') {
    const { value: thresholdValue, operator, severity } = threshold
    let triggered = false

    switch (operator) {
      case '>': triggered = value > thresholdValue; break
      case '>=': triggered = value >= thresholdValue; break
      case '<': triggered = value < thresholdValue; break
      case '<=': triggered = value <= thresholdValue; break
      case '=': triggered = value === thresholdValue; break
      case '!=': triggered = value !== thresholdValue; break
    }

    if (triggered) {
      thresholdStatus = severity
      thresholdMessage = `Threshold ${operator} ${thresholdValue} ${severity === 'critical' ? 'BREACHED' : 'triggered'}`
    }
  }

  const trendIcon = trend
    ? trend.value > 0
      ? <TrendingUp className="h-4 w-4 text-green-600" />
      : trend.value < 0
      ? <TrendingDown className="h-4 w-4 text-red-600" />
      : <Minus className="h-4 w-4 text-gray-400" />
    : null

  const thresholdIcon = thresholdStatus === 'critical'
    ? <AlertTriangle className="h-4 w-4 text-red-600" />
    : thresholdStatus === 'warning'
    ? <AlertTriangle className="h-4 w-4 text-yellow-600" />
    : thresholdStatus === 'info'
    ? <CheckCircle className="h-4 w-4 text-blue-600" />
    : null

  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        isClickable && 'cursor-pointer',
        thresholdStatus === 'critical' && 'border-l-4 border-red-500',
        thresholdStatus === 'warning' && 'border-l-4 border-yellow-500',
        thresholdStatus === 'info' && 'border-l-4 border-blue-500',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {thresholdIcon}
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? '—' : value}</div>
        {trend && !loading && (
          <div className="flex items-center gap-1 text-sm mt-1">
            {trendIcon}
            <span className={cn(
              'font-medium',
              trend.value > 0 && 'text-green-600',
              trend.value < 0 && 'text-red-600',
              trend.value === 0 && 'text-gray-500'
            )}>
              {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
            </span>
            {trend.label && (
              <span className="text-muted-foreground">{trend.label}</span>
            )}
          </div>
        )}
        {thresholdMessage && !loading && (
          <div className={cn(
            'text-xs mt-1 flex items-center gap-1',
            thresholdStatus === 'critical' && 'text-red-600',
            thresholdStatus === 'warning' && 'text-yellow-600',
            thresholdStatus === 'info' && 'text-blue-600'
          )}>
            {thresholdIcon}
            {thresholdMessage}
          </div>
        )}
      </CardContent>
    </Card>
  )
}