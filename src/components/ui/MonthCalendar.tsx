import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthCalendarProps {
  month: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  selectedDate?: Date | null
  onSelectDate?: (date: Date) => void
  dayBadge?: (date: Date) => number | null
}

export function MonthCalendar({ month, onPrevMonth, onNextMonth, selectedDate, onSelectDate, dayBadge }: MonthCalendarProps) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={onPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">{format(month, 'MMMM yyyy')}</span>
        <button type="button" onClick={onNextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month)
          const selected = selectedDate && isSameDay(day, selectedDate)
          const badge = dayBadge?.(day) ?? null
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate?.(day)}
              disabled={!onSelectDate}
              className={cn(
                'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors relative',
                inMonth ? 'text-gray-900' : 'text-gray-300',
                selected
                  ? 'ring-2 ring-(--color-primary) bg-(--color-primary)/5 font-semibold'
                  : isToday(day)
                  ? 'bg-gray-100 font-semibold'
                  : 'hover:bg-gray-50',
              )}
            >
              <span>{format(day, 'd')}</span>
              {badge !== null && badge > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-primary)" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
