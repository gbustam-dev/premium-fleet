export interface FuelLog {
  id: string;
  vehicleId: string;
  date: string;
  time?: string;
  liters: number;
  pricePerLiter: number;
  mileage: number;
  totalCost: number;
  stationName: string;
  address?: string;
  fuelType: 'Gasolina 93' | 'Gasolina 95' | 'Gasolina 97' | 'Diesel' | string;
  isHighEfficiency?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  plate?: string;
  targetEfficiency?: number;
  propulsion?: string;
}

export interface DashboardStats {
  averageEfficiency: number;
  currentOdometer: number;
  monthlyTotalCost: number;
  budgetPercentage: number;
  operationalEfficiency: number;
  savedLiters: number;
  consumptionHistory: number[];
}

export interface GeneralStats {
  totalRefuels: number;
  totalKilometers: number;
  estimatedSavings: number;
  monthlyConsumption: { month: string; liters: number; isCurrent?: boolean }[];
  priceVariation: { label: string; price: number }[];
  efficiencyHistory: { month: string; value: number }[];
  odometerHistory: { month: string; value: number }[];
}

export interface UserProfile {
  name: string;
  email: string;
  preferredUnits: 'KM/L' | 'L/100KM' | 'MPG';
  currency: string;
  avatarUrl?: string;
  geminiApiKey?: string;
}
