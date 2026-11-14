// First-party Town Crier locations captured from the retailer's public
// /api/locations response on 2026-11-14. Research only.
export const TOWN_CRIER_LA_STORES = Object.freeze([
  Object.freeze({ id: '1', name: 'Town Crier #1 - Mandeville', address: '4350 Hwy 22, Suite D, Mandeville, LA 70471' }),
  Object.freeze({ id: '2', name: 'Town Crier #2 - Slidell', address: '3080 East Gause Blvd, Slidell, LA 70461' }),
  Object.freeze({ id: '4', name: 'Town Crier #4 - Ponchatoula', address: '825 West Pine Street, Ponchatoula, LA 70454' }),
  Object.freeze({ id: '7', name: 'Town Crier #7 - Franklinton', address: '1513 Washington Street, Franklinton, LA 70438' }),
  Object.freeze({ id: '8', name: 'Town Crier #8 - Amite', address: '802 West Oak Street, Amite, LA 70422' }),
  Object.freeze({ id: '12', name: 'Town Crier #12 - Franklinton', address: '715 Washington Street, Franklinton, LA 70438' }),
  Object.freeze({ id: '17', name: 'Town Crier #17 - Slidell', address: '604 Robert Blvd, Slidell, LA 70458' }),
  Object.freeze({ id: '18', name: 'Town Crier #18 - Abita Springs', address: '70117 Hwy 59 Unit A, Abita Springs, LA 70420' }),
]);

// UPC and source-name checks are exact. Eagle Rare's source description
// establishes the 10-year expression; the API does not provide a Bible ID.
export const TOWN_CRIER_LA_PRODUCTS = Object.freeze([
  Object.freeze({ upc: '088004021344', sourceName: 'EAGLE RARE SINGLE BARREL 750ML', category: 'EAGLE RARE', canonicalName: 'Eagle Rare 10 Year', identityEvidence: 'description identifies Eagle Rare aged no less than ten years and 90 proof' }),
  Object.freeze({ upc: '088004005498', sourceName: 'EH TAYLOR JR SMALL BATCH 750ML', category: 'EH TAYLOR', canonicalName: 'E.H. Taylor Small Batch', identityEvidence: 'exact UPC and first-party small-batch source name' }),
]);

export const TOWN_CRIER_LA_API_ORIGIN = 'https://thetowncrier.net';
