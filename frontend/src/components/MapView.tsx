import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef } from 'react'

export interface MapPoint {
  lat: number
  lng: number
  label: string
  /** route: the collector's trail · payment · visit · stop · me */
  kind: 'route' | 'payment' | 'visit' | 'stop' | 'me'
}

const COLORS: Record<MapPoint['kind'], string> = {
  route: '#0369a1',
  payment: '#059669',
  visit: '#b45309',
  stop: '#0e6b4f',
  me: '#dc2626',
}

// Santo Domingo, when there is nothing to show yet.
const DEFAULT_CENTER: [number, number] = [18.4861, -69.9312]

/** OpenStreetMap through Leaflet, loaded only on the screens with a map.
 * Points are drawn as circles (no image assets); the trail joins the
 * collector's pings in time order. Phase 10 reviews the tile provider. */
export default function MapView({
  points,
  trail = false,
}: {
  points: MapPoint[]
  trail?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return
    map.current = L.map(container.current, { zoomControl: true }).setView(DEFAULT_CENTER, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const group = layer.current
    if (!group || !map.current) return
    group.clearLayers()
    if (trail) {
      const path = points
        .filter((p) => p.kind === 'route')
        .map((p) => [p.lat, p.lng] as [number, number])
      if (path.length > 1)
        L.polyline(path, { color: COLORS.route, weight: 3, opacity: 0.6 }).addTo(group)
    }
    for (const point of points) {
      L.circleMarker([point.lat, point.lng], {
        radius: point.kind === 'route' ? 4 : 8,
        color: '#ffffff',
        weight: 2,
        fillColor: COLORS[point.kind],
        fillOpacity: 0.95,
      })
        .bindTooltip(point.label)
        .addTo(group)
    }
    if (points.length) {
      map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        padding: [30, 30],
        maxZoom: 16,
      })
    }
  }, [points, trail])

  return (
    <div
      ref={container}
      role="region"
      aria-label="Mapa"
      className="h-[60vh] min-h-72 w-full overflow-hidden rounded-xl border border-edge"
    />
  )
}
