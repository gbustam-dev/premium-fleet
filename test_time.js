const defaultTime = "12:00 PM";
const cleanTime = defaultTime.replace(/[^0-9:]/g, '');
console.log("cleanTime:", cleanTime);

const parts = cleanTime.split(':');
let hour = parts[0];
let min = parts[1];

if (hour.length > 2) hour = hour.substring(0,2);
if (min.length > 2) min = min.substring(0,2);
console.log(`${hour}:${min}`);
