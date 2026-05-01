import { useState } from 'react'

const KEY = 'delsea_favourite_services'

function load(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<string[]>(load)

  function toggle(serviceId: string) {
    setFavourites((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  return {
    favourites,
    toggle,
    isFavourite: (id: string) => favourites.includes(id),
  }
}
