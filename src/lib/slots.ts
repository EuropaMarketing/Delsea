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
  minNoticeMinutes = 5,
  // service_id -> that service's own pre/post buffer, so an existing booking's set-down
  // time (e.g. massage + 10 min) is respected too, not just the new slot's own buffer.
  serviceBuffers?: Map<string, { pre: number; post: number }>,
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
      const nowPlusNotice = addMinutes(new Date(), minNoticeMinutes)

      // Skip slots that don't meet the minimum notice period
      if (isBefore(current, nowPlusNotice)) {
        current = addMinutes(current, slotStep)
        continue
      }

      // Check overlap with bookings — the full buffered window on both sides, so an
      // existing booking's own set-down time can't be booked into either.
      const overlapsBooking = existingBookings.some((b) => {
        if (b.status === 'cancelled') return false
        const buf = serviceBuffers?.get(b.service_id)
        const bStart = addMinutes(parseISO(b.starts_at), -(buf?.pre ?? 0))
        const bEnd = addMinutes(parseISO(b.ends_at), buf?.post ?? 0)
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
