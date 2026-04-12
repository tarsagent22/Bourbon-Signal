export interface ZipCentroid {
  zip: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
}

// Seed file for precise ZIP handling in active states. Expand as coverage grows.
export const ZIP_CENTROIDS: Record<string, ZipCentroid> = {
  "27023": { zip: "27023", lat: 35.8946, lng: -80.5617, city: "Mocksville", state: "NC" },
  "27028": { zip: "27028", lat: 35.9226, lng: -80.4403, city: "Mocksville", state: "NC" },
  "27103": { zip: "27103", lat: 36.0673, lng: -80.3075, city: "Winston-Salem", state: "NC" },
  "23220": { zip: "23220", lat: 37.5495, lng: -77.4586, city: "Richmond", state: "VA" },
  "20190": { zip: "20190", lat: 38.9696, lng: -77.3463, city: "Reston", state: "VA" },
  "19103": { zip: "19103", lat: 39.9527, lng: -75.1741, city: "Philadelphia", state: "PA" },
  "15222": { zip: "15222", lat: 40.4473, lng: -79.9930, city: "Pittsburgh", state: "PA" },
};
