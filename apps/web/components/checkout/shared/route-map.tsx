"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { GoogleMap, DirectionsRenderer, OverlayViewF, OVERLAY_MOUSE_TARGET } from "@react-google-maps/api"
import { useGoogleMaps } from "@/components/providers/google-maps-provider"
import { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY } from "@/lib/env"

interface Location {
  lat: number | null
  lng: number | null
  address?: string
}

interface RouteMapProps {
  from: Location
  to: Location
  stops?: Location[]
  className?: string
  onRouteCalculated?: (distance: number, duration: number) => void
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const defaultCenter = {
  lat: 38.7223,
  lng: -9.1393,
}

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "transit",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
}

function StaticMapFallback({ from, to, className }: { from: Location; to: Location; className?: string }) {
  const apiKey = NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  
  if (!apiKey || from.lat === null || from.lng === null || to.lat === null || to.lng === null) {
    return (
      <div className={`bg-[var(--ck-surface,#1e1d1b)] rounded-none flex items-center justify-center ${className}`}>
        <div className="text-center px-4">
          <div className="w-12 h-12 mx-auto mb-2 bg-[rgba(var(--ck-accent-rgb,201,169,110),0.12)] rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--ck-accent,#c9a96e)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-[var(--ck-text-muted,#999)] text-sm">Select locations to see route</p>
        </div>
      </div>
    )
  }

  const centerLat = (from.lat + to.lat) / 2
  const centerLng = (from.lng + to.lng) / 2
  
  const markers = `markers=color:0xc9a96e%7Clabel:A%7C${from.lat},${from.lng}&markers=color:0xc9a96e%7Clabel:B%7C${to.lat},${to.lng}`
  const path = `path=color:0xc9a96e%7Cweight:4%7C${from.lat},${from.lng}%7C${to.lat},${to.lng}`
  
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=6&size=600x400&maptype=roadmap&${markers}&${path}&key=${apiKey}`

  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <img 
        src={staticMapUrl} 
        alt="Route map" 
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
        }}
      />
    </div>
  )
}

function RouteMapInner({ from, to, stops = [], className, onRouteCalculated }: RouteMapProps) {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)
  const [mapLoadFailed, setMapLoadFailed] = useState(false)
  const [loadTimeout, setLoadTimeout] = useState(false)
  const lastRequestRef = useRef<string>("")

  const { isLoaded, hasKey, loadError } = useGoogleMaps()

  const fromLat = from.lat
  const fromLng = from.lng
  const toLat = to.lat
  const toLng = to.lng

  const hasValidLocations = fromLat !== null && fromLng !== null && toLat !== null && toLng !== null

  const center = useMemo(() => 
    fromLat !== null && fromLng !== null 
      ? { lat: fromLat, lng: fromLng }
      : defaultCenter,
    [fromLat, fromLng]
  )

  const stopsKey = useMemo(() => 
    stops.map(s => `${s.lat},${s.lng}`).join("|"),
    [stops]
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isLoaded) {
        setLoadTimeout(true)
      }
    }, 5000)

    return () => clearTimeout(timeout)
  }, [isLoaded])

  useEffect(() => {
    if (loadError) {
      setMapLoadFailed(true)
    }
  }, [loadError])

  useEffect(() => {
    if (!isLoaded || !hasValidLocations || mapLoadFailed) {
      return
    }

    const requestKey = `${fromLat},${fromLng}-${toLat},${toLng}-${stopsKey}`
    if (requestKey === lastRequestRef.current) {
      return
    }
    lastRequestRef.current = requestKey

    const directionsService = new google.maps.DirectionsService()

    const waypoints = stops
      .filter((stop) => stop.lat !== null && stop.lng !== null)
      .map((stop) => ({
        location: { lat: stop.lat!, lng: stop.lng! },
        stopover: true,
      }))

    directionsService.route(
      {
        origin: { lat: fromLat!, lng: fromLng! },
        destination: { lat: toLat!, lng: toLng! },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result)
          
          // Calculate total distance and duration
          if (result.routes[0]?.legs) {
            let totalDistanceMeters = 0
            let totalDurationSeconds = 0
            
            result.routes[0].legs.forEach((leg) => {
              totalDistanceMeters += leg.distance?.value || 0
              totalDurationSeconds += leg.duration?.value || 0
            })
            
            const distanceKm = totalDistanceMeters / 1000
            const durationMinutes = Math.round(totalDurationSeconds / 60)
            
            if (onRouteCalculated) {
              onRouteCalculated(distanceKm, durationMinutes)
            }
          }
        }
      }
    )
  }, [isLoaded, hasValidLocations, fromLat, fromLng, toLat, toLng, stopsKey, stops, mapLoadFailed])

  if (!hasKey) {
    return (
      <div className={`bg-[var(--ck-surface,#1e1d1b)] rounded-none flex items-center justify-center ${className}`}>
        <p className="text-[var(--ck-text-muted,#999)] text-sm">Map unavailable</p>
      </div>
    )
  }

  if (!hasValidLocations) {
    return (
      <div className={`bg-[var(--ck-surface,#1e1d1b)] rounded-none flex items-center justify-center ${className}`}>
        <div className="text-center px-4">
          <div className="w-12 h-12 mx-auto mb-2 bg-[rgba(var(--ck-accent-rgb,201,169,110),0.12)] rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--ck-accent,#c9a96e)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-[var(--ck-text-muted,#999)] text-sm">Select locations to see route</p>
        </div>
      </div>
    )
  }

  if (mapLoadFailed || loadTimeout) {
    return <StaticMapFallback from={from} to={to} className={className} />
  }

  if (!isLoaded) {
    return (
      <div className={`bg-[var(--ck-surface,#1e1d1b)] rounded-none flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-[var(--ck-accent,#c9a96e)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={12}
        options={mapOptions}
      >
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              suppressInfoWindows: true,
              markerOptions: { visible: false },
              polylineOptions: {
                strokeColor: "#a08248",
                strokeWeight: 4,
                strokeOpacity: 0.8,
              },
            }}
          />
        )}
        <OverlayViewF
          position={{ lat: fromLat!, lng: fromLng! }}
          mapPaneName={OVERLAY_MOUSE_TARGET}
        >
          <div className="flex flex-col items-center" style={{ transform: "translate(-50%, -100%)" }}>
            <div className="w-[36px] h-[36px] rounded-full bg-[var(--ck-accent,#c9a96e)] border-[3px] border-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center">
              <span className="text-[#0d0d0d] text-[14px] font-bold leading-none">A</span>
            </div>
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white -mt-[1px]" />
          </div>
        </OverlayViewF>
        <OverlayViewF
          position={{ lat: toLat!, lng: toLng! }}
          mapPaneName={OVERLAY_MOUSE_TARGET}
        >
          <div className="flex flex-col items-center" style={{ transform: "translate(-50%, -100%)" }}>
            <div className="w-[36px] h-[36px] rounded-full bg-[var(--ck-text,#f7f4ef)] border-[3px] border-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center">
              <span className="text-[var(--ck-bg,#0d0d0d)] text-[14px] font-bold leading-none">B</span>
            </div>
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white -mt-[1px]" />
          </div>
        </OverlayViewF>
        {stops.map((stop, index) => (
          stop.lat !== null && stop.lng !== null && (
            <OverlayViewF
              key={index}
              position={{ lat: stop.lat, lng: stop.lng }}
              mapPaneName={OVERLAY_MOUSE_TARGET}
            >
              <div className="flex flex-col items-center" style={{ transform: "translate(-50%, -100%)" }}>
                <div className="w-[28px] h-[28px] rounded-full bg-[#808080] border-[2px] border-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] flex items-center justify-center">
                  <span className="text-white text-[11px] font-bold leading-none">{index + 1}</span>
                </div>
                <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-white -mt-[1px]" />
              </div>
            </OverlayViewF>
          )
        ))}
      </GoogleMap>
    </div>
  )
}

export function RouteMap({ from, to, stops = [], className, onRouteCalculated }: RouteMapProps) {
  return (
    <RouteMapInner 
      from={from} 
      to={to} 
      stops={stops} 
      className={className}
      onRouteCalculated={onRouteCalculated}
    />
  )
}
