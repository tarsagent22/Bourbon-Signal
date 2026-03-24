export interface Store {
  id: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  county: string;
}

export const stores: Store[] = [
  // Raleigh stores
  {
    id: "store-001",
    address: "7200 Sandy Fork Rd. Raleigh, NC 27609",
    city: "Raleigh",
    lat: 35.8396,
    lng: -78.5782,
    county: "Wake County",
  },
  {
    id: "store-002",
    address: "2645 Appliance Ct. Raleigh, NC 27604",
    city: "Raleigh",
    lat: 35.8096,
    lng: -78.6182,
    county: "Wake County",
  },
  {
    id: "store-003",
    address: "6301 Town Center Dr. Raleigh, NC 27614",
    city: "Raleigh",
    lat: 35.9196,
    lng: -78.6482,
    county: "Wake County",
  },
  {
    id: "store-004",
    address: "7911 ACC Blvd. Raleigh, NC 27617",
    city: "Raleigh",
    lat: 35.8596,
    lng: -78.7182,
    county: "Wake County",
  },
  {
    id: "store-005",
    address: "2109-106 Avent Ferry Rd. Raleigh, NC 27606",
    city: "Raleigh",
    lat: 35.7696,
    lng: -78.6782,
    county: "Wake County",
  },
  {
    id: "store-006",
    address: "1222 New Bern Ave. Raleigh, NC 27401",
    city: "Raleigh",
    lat: 35.7796,
    lng: -78.6182,
    county: "Wake County",
  },
  // Cary stores
  {
    id: "store-007",
    address: "665 Cary Towne Blvd. Cary, NC 27511",
    city: "Cary",
    lat: 35.7615,
    lng: -78.7811,
    county: "Wake County",
  },
  {
    id: "store-008",
    address: "6494 Tryon Rd. Cary, NC 27511",
    city: "Cary",
    lat: 35.7315,
    lng: -78.8011,
    county: "Wake County",
  },
  // Apex stores
  {
    id: "store-009",
    address: "1793 West Williams St. Apex, NC 27502",
    city: "Apex",
    lat: 35.7327,
    lng: -78.8603,
    county: "Wake County",
  },
  {
    id: "store-010",
    address: "1415 E. Williams St. Apex, NC 27617",
    city: "Apex",
    lat: 35.7227,
    lng: -78.8303,
    county: "Wake County",
  },
  // Wake Forest
  {
    id: "store-011",
    address: "11360 Capital Blvd. Wake Forest, NC 27587",
    city: "Wake Forest",
    lat: 35.9799,
    lng: -78.5097,
    county: "Wake County",
  },
  // Knightdale
  {
    id: "store-012",
    address: "704 Money Ct. Knightdale, NC 27545",
    city: "Knightdale",
    lat: 35.7879,
    lng: -78.4808,
    county: "Wake County",
  },
  // Rolesville
  {
    id: "store-013",
    address: "4501 Vineyrd Pine Ln. Rolesville, NC 27571",
    city: "Rolesville",
    lat: 35.9232,
    lng: -78.4575,
    county: "Wake County",
  },
  // Morrisville
  {
    id: "store-014",
    address: "4009 Davis Dr. Morrisville, NC 27560",
    city: "Morrisville",
    lat: 35.8235,
    lng: -78.8256,
    county: "Wake County",
  },
  // Zebulon
  {
    id: "store-015",
    address: "1420 N Ardendell Dr. Zebulon, NC 27597",
    city: "Zebulon",
    lat: 35.8243,
    lng: -78.3148,
    county: "Wake County",
  },
  // Durham (shipment board)
  {
    id: "store-016",
    address: "3600 N Duke St. Durham, NC 27704",
    city: "Durham",
    lat: 35.9940,
    lng: -78.8986,
    county: "Durham County",
  },
  // Greensboro (shipment board)
  {
    id: "store-017",
    address: "4500 W Market St. Greensboro, NC 27407",
    city: "Greensboro",
    lat: 36.0726,
    lng: -79.7920,
    county: "Greensboro ABC Board",
  },
  // Charlotte / Mecklenburg (shipment board)
  {
    id: "store-018",
    address: "1200 E Morehead St. Charlotte, NC 28204",
    city: "Charlotte",
    lat: 35.2171,
    lng: -80.8231,
    county: "Mecklenburg County",
  },
  // Wilmington / New Hanover (shipment board)
  {
    id: "store-019",
    address: "3501 Oleander Dr. Wilmington, NC 28403",
    city: "Wilmington",
    lat: 34.2257,
    lng: -77.9447,
    county: "New Hanover County",
  },
  // Asheville (shipment board)
  {
    id: "store-020",
    address: "945 Merrimon Ave. Asheville, NC 28804",
    city: "Asheville",
    lat: 35.5951,
    lng: -82.5515,
    county: "Asheville ABC Board",
  },
  // Fayetteville / Cumberland (shipment board)
  {
    id: "store-021",
    address: "1550 Skibo Rd. Fayetteville, NC 28303",
    city: "Fayetteville",
    lat: 35.0527,
    lng: -78.8784,
    county: "Cumberland County",
  },
  // High Point (shipment board)
  {
    id: "store-022",
    address: "2628 S Main St. High Point, NC 27263",
    city: "High Point",
    lat: 35.9557,
    lng: -80.0053,
    county: "High Point ABC Board",
  },
  // Gastonia (shipment board)
  {
    id: "store-023",
    address: "529 Cox Rd. Gastonia, NC 28054",
    city: "Gastonia",
    lat: 35.2621,
    lng: -81.1873,
    county: "Gastonia ABC Board",
  },
  // Goldsboro / Wayne County (shipment board)
  {
    id: "store-024",
    address: "700 N Berkeley Blvd. Goldsboro, NC 27534",
    city: "Goldsboro",
    lat: 35.3849,
    lng: -77.9928,
    county: "Wayne County",
  },
];
