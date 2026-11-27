export interface VehicleType {
  id: string
  title: string
  img: string
  briefcase: number
  passengers: number
  price: number
  priceNight: number
  min: number
  wifi?: boolean
  isElectric?: boolean
}

export const vehiclesData: VehicleType[] = [
  {
    id: "standard",
    title: "Standard",
    img: "/shared/image-54.png",
    briefcase: 4,
    passengers: 4,
    price: 0.85,
    priceNight: 1.05,
    min: 35,
    isElectric: true,
  },
  {
    id: "xl",
    title: "XL",
    img: "/shared/image-54.png",
    briefcase: 4,
    passengers: 4,
    price: 1.15,
    priceNight: 1.3,
    min: 50,
  },
  {
    id: "executivo",
    title: "Executivo",
    img: "/shared/image-54.png",
    briefcase: 4,
    passengers: 4,
    price: 1.3,
    priceNight: 1.45,
    min: 55,
  },
  {
    id: "van",
    title: "Van",
    img: "/shared/image-54.png",
    briefcase: 8,
    passengers: 8,
    price: 1.75,
    priceNight: 1.92,
    min: 55,
    isElectric: true,
  },
  {
    id: "minibus",
    title: "Minibus",
    img: "/shared/image-54.png",
    briefcase: 15,
    passengers: 15,
    price: 3.2,
    priceNight: 3.7,
    min: 105,
  },
  {
    id: "autocarro",
    title: "Autocarro",
    img: "/shared/image-54.png",
    briefcase: 56,
    passengers: 56,
    price: 12.5,
    priceNight: 13.2,
    min: 305,
  },
]

export function calculateVehiclePrice(vehicle: VehicleType, distanceKm: number, isNight: boolean): number {
  const rate = isNight ? vehicle.priceNight : vehicle.price
  const basePrice = rate * distanceKm
  return Math.max(vehicle.min, Math.round(basePrice * 100) / 100)
}

