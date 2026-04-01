export const VEHICLE_BRANDS = [
  { idMarca: 37, nombre: "Toyota" },
  { idMarca: 33, nombre: "Hyundai" },
  { idMarca: 40, nombre: "Kia" },
  { idMarca: 3, nombre: "Chevrolet" },
  { idMarca: 2, nombre: "Suzuki" },
  { idMarca: 14, nombre: "Peugeot" },
  { idMarca: 4, nombre: "Nissan" },
  { idMarca: 18, nombre: "Ford" },
  { idMarca: 52, nombre: "MG" },
  { idMarca: 53, nombre: "Mitsubishi" },
  { idMarca: 26, nombre: "Volkswagen" },
  { idMarca: 28, nombre: "Mazda" },
  { idMarca: 30, nombre: "Opel" },
  { idMarca: 11, nombre: "Citroen" },
  { idMarca: 24, nombre: "Audi" },
  { idMarca: 12, nombre: "BMW" },
  { idMarca: 8, nombre: "M. Benz" }
];

export const COMMON_PROPULSIONS = [
  { idEtiqueta: "G", nombre: "Gasolina" },
  { idEtiqueta: "D", nombre: "Diésel" },
  { idEtiqueta: "H", nombre: "Híbrido (HEV)" },
  { idEtiqueta: "PH", nombre: "Híbrido Enchufable (PHEV)" }
];

export const VEHICLE_MODELS: Record<string, string[]> = {
  "Toyota": ["4Runner", "Auris", "Camry", "Corolla", "Corolla Cross", "Corolla Sport", "Fortuner", "GR Yaris", "Hilux", "Land Cruiser Prado", "RAV4", "Yaris", "Yaris Cross"],
  "Hyundai": ["Accent", "Creta", "Creta Grand", "Elantra", "Kona", "Palisade", "Santa Fe", "Staria", "Tucson", "Venue", "Ioniq"],
  "Kia": ["Carens", "Carnival", "Cerato", "K3", "Morning", "Niro", "Rio", "Seltos", "Soluto", "Sorento", "Sportage", "Sonet"],
  "Chevrolet": ["Aveo", "Blazer", "Captiva", "Colorado", "Equinox", "Groove", "Montana", "Onix", "Sail", "Silverado", "Spark", "Spin", "Suburban", "Tahoe", "Tracker"],
  "Suzuki": ["Alto", "Baleno", "Celerio", "Dzire", "Ertiga", "Fronx", "Grand Vitara", "Jimny", "S-Cross", "S-Presso", "Swift", "Vitara", "XL7"],
  "Peugeot": ["2008", "208", "3008", "301", "308", "408", "5008", "508", "Partner", "Rifter", "Landtrek", "Expert", "Boxer"],
  "Nissan": ["Kicks", "March", "Murano", "Navara", "Pathfinder", "Qashqai", "Sentra", "Tiida", "Versa", "X-Trail", "Frontier"],
  "Ford": ["Bronco Sport", "Edge", "Escape", "Expedition", "Explorer", "F-150", "Maverick", "Mustang", "Ranger", "Territory", "EcoSport"],
  "MG": ["MG 3", "MG 5", "MG 6", "MG GT", "MG ONE", "MG RX5", "MG ZS", "MG HS", "MG ZX"],
  "Mitsubishi": ["ASX", "Eclipse Cross", "L200", "Lancer", "Mirage", "Montero", "Montero Sport", "Outlander", "Outlander PHEV", "Xpander"],
  "Volkswagen": ["Amarok", "Gol", "Golf", "Jetta", "Nivus", "Polo", "Saveiro", "T-Cross", "Taos", "Tiguan", "Virtus", "Voyage"],
  "Mazda": ["Mazda 2", "Mazda 3", "Mazda 6", "CX-3", "CX-30", "CX-5", "CX-50", "CX-60", "CX-9", "CX-90", "BT-50"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "Q8", "RS3", "RS5", "S3"],
  "BMW": ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Z4"],
  "M. Benz": ["Clase A", "Clase B", "Clase C", "Clase E", "Clase S", "GLA", "GLB", "GLC", "GLE", "GLS", "Sprinter", "Vito"]
};

// Default efficiencies if API fails (KM/L)
export const DEFAULT_EFFICIENCIES: Record<string, number> = {
  "Toyota Corolla Cross": 25.4,
  "Toyota RAV4": 22.1,
  "Toyota Corolla": 18.2,
  "Toyota Yaris": 17.5,
  "Hyundai Tucson": 14.8,
  "Hyundai Santa Fe": 12.5,
  "Kia Sportage": 14.5,
  "Kia Niro": 24.1,
  "Suzuki Swift": 21.0,
  "Suzuki Grand Vitara": 16.5,
  "Suzuki Jimny": 13.2,
  "Peugeot 208": 23.5,
  "Peugeot 2008": 20.8,
  "MG 3": 15.8,
  "MG ZS": 14.2,
  "Mitsubishi L200": 12.3,
  "Mitsubishi Outlander": 13.5,
  "Chevrolet Onix": 16.8,
  "Chevrolet Tracker": 15.5,
  "Nissan Versa": 17.2,
  "Nissan Qashqai": 13.8,
  "Ford Ranger": 11.5,
  "Ford Maverick": 18.5,
  "Volkswagen T-Cross": 15.2,
  "Mazda CX-5": 13.1
};
