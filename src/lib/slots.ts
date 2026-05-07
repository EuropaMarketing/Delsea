import {
  format, addMinutes, parseISO, getDay, isAfter, isBefore,
  setHours, setMinutes, startOfDay,
} from 'date-fns'
import type { Availability, BlockedTime, Booking } from '@/types'

export function generateTimeSlots(
  date: Date,
  availability: Availability[],
  durationMinutes: number,
  existingBookings: Booking[],
  blockedTimes: BlockedTime[],
  preBuffer = 0,
  postBuffer = 0,
): string[] {
  const dayOfWeek = getDay(date)
  const rawDayAvail = availability.filter((a) => a.day_of_week === dayOfWeek)
  if (!rawDayAvail.length) return []

  // Deduplicate windows so multiple staff with identical hours don't produce duplicate slots
  const seen = new Set<string>()
  const dayAvail = rawDayAvail.filter((a) => {
    const key = `${a.start_time}|${a.end_time}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const slotSet = new Set<string>()
  const slots: string[] = []
  const slotStep = 15

  for (const avail of dayAvail) {
    const [startH, startM] = avail.start_time.split(':').map(Number)
    const [endH, endM] = avail.end_time.split(':').map(Number)

    let current = setMinutes(setHours(startOfDay(date), startH), startM)
    const end = setMinutes(setHours(startOfDay(date), endH), endM)

    while (isBefore(addMinutes(current, durationMinutes), end) ||
           addMinutes(current, durationMinutes).getTime() === end.getTime()) {

      // The window this slot occupies including buffers
      const slotWindowStart = addMinutes(current, -preBuffer)
      const slotWindowEnd = addMinutes(current, durationMinutes + postBuffer)
      const nowPlusFive = addMinutes(new Date(), 5)

      // Skip past slots
      if (isBefore(current, nowPlusFive)) {
        current = addMinutes(current, slotStep)
        continue
      }

      // Check overlap with bookings (against the full buffered window)
      const overlapsBooking = existingBookings.some((b) => {
        if (b.status === 'cancelled') return false
        const bStart = parseISO(b.starts_at)
        const bEnd = parseISO(b.ends_at)
        return isBefore(slotWindowStart, bEnd) && isAfter(slotWindowEnd, bStart)
      })

      // Check overlap with blocked times
      const overlapsBlock = blockedTimes.some((bt) => {
        const bStart = parseISO(bt.starts_at)
        const bEnd = parseISO(bt.ends_at)
        return isBefore(slotWindowStart, bEnd) && isAfter(slotWindowEnd, bStart)
      })

      if (!overlapsBooking && !overlapsBlock) {
        const label = format(current, 'HH:mm')
        if (!slotSet.has(label)) { slotSet.add(label); slots.push(label) }
      }

      current = addMinutes(current, slotStep)
    }
  }

  return slots
}

export function buildICSLink(
  title: string,
  starts_at: string,
  ends_at: string,
  location = '',
  description = '',
): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const start = fmt(parseISO(starts_at))
  const end = fmt(parseISO(ends_at))

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n')

  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`
}
