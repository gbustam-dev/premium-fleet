// Mock to test validation
const hasRequiredFields = (data, fields) => fields.every(f => data.hasOwnProperty(f));
const hasOnlyAllowedFields = (data, fields) => Object.keys(data).every(k => fields.includes(k));

const isValidFuelLog = (data) => {
      return hasRequiredFields(data, ['vehicleId', 'date', 'time', 'mileage', 'liters', 'pricePerLiter', 'totalCost']) &&
             hasOnlyAllowedFields(data, ['id', 'vehicleId', 'date', 'time', 'mileage', 'liters', 'pricePerLiter', 'totalCost', 'stationName', 'address', 'fuelType', 'isHighEfficiency', 'location']) &&
             (!('id' in data) || typeof data.id === 'string') &&
             typeof data.vehicleId === 'string' &&
             typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
             typeof data.time === 'string' && /^\d{1,2}:\d{2}$/.test(data.time) &&
             typeof data.mileage === 'number' && data.mileage >= 0 &&
             typeof data.liters === 'number' && data.liters > 0 &&
             typeof data.pricePerLiter === 'number' && data.pricePerLiter > 0 &&
             typeof data.totalCost === 'number' && data.totalCost >= 0 &&
             (!('stationName' in data) || (typeof data.stationName === 'string' && data.stationName.length <= 100)) &&
             (!('address' in data) || (typeof data.address === 'string' && data.address.length <= 200)) &&
             (!('fuelType' in data) || (typeof data.fuelType === 'string' && data.fuelType.length <= 50)) &&
             (!('isHighEfficiency' in data) || typeof data.isHighEfficiency === 'boolean') &&
             (!('location' in data) || (typeof data.location === 'object' && typeof data.location.latitude === 'number' && typeof data.location.longitude === 'number'));
};

const cleanData = {
      vehicleId: "123",
      date: "2023-10-10",
      time: "12:00",
      mileage: 0,
      liters: 1,
      pricePerLiter: 1,
      totalCost: 0,
};

console.log("cleanData isValid:", isValidFuelLog(cleanData));

// Test with 0 values
const data2 = {
      vehicleId: "123",
      date: "2023-10-10",
      time: "24:00",
      mileage: 0,
      liters: 0, // Invalid according to rules
      pricePerLiter: 0, // Invalid according to rules
      totalCost: 0,
};
console.log("data2 isValid:", isValidFuelLog(data2));
