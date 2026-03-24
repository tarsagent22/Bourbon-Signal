"use client";

import Link from "next/link";

interface CountyLinkProps {
  county: string;
  lat?: number;
  lng?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

// Approximate county center coordinates for NC counties
const COUNTY_COORDS: Record<string, { lat: number; lng: number }> = {
  wake: { lat: 35.78, lng: -78.64 },
  durham: { lat: 36.0, lng: -78.9 },
  mecklenburg: { lat: 35.23, lng: -80.84 },
  guilford: { lat: 36.07, lng: -79.79 },
  "new hanover": { lat: 34.24, lng: -77.87 },
  buncombe: { lat: 35.6, lng: -82.55 },
  forsyth: { lat: 36.07, lng: -80.26 },
  cumberland: { lat: 35.05, lng: -78.88 },
  onslow: { lat: 34.76, lng: -77.43 },
  pitt: { lat: 35.6, lng: -77.39 },
  cabarrus: { lat: 35.39, lng: -80.56 },
  catawba: { lat: 35.66, lng: -81.22 },
  gaston: { lat: 35.26, lng: -81.19 },
  iredell: { lat: 35.79, lng: -80.88 },
  johnston: { lat: 35.52, lng: -78.36 },
  orange: { lat: 36.06, lng: -79.12 },
  randolph: { lat: 35.71, lng: -79.81 },
  rowan: { lat: 35.64, lng: -80.52 },
  union: { lat: 34.99, lng: -80.53 },
  alamance: { lat: 36.04, lng: -79.4 },
  davidson: { lat: 35.8, lng: -80.21 },
  harnett: { lat: 35.37, lng: -78.87 },
  moore: { lat: 35.31, lng: -79.48 },
  nash: { lat: 35.97, lng: -78.0 },
  robeson: { lat: 34.64, lng: -79.1 },
  wayne: { lat: 35.37, lng: -78.0 },
  wilson: { lat: 35.73, lng: -77.92 },
  craven: { lat: 35.12, lng: -77.07 },
  carteret: { lat: 34.76, lng: -76.63 },
  chatham: { lat: 35.72, lng: -79.27 },
  lee: { lat: 35.47, lng: -79.17 },
  brunswick: { lat: 34.04, lng: -78.25 },
  henderson: { lat: 35.32, lng: -82.48 },
  greensboro: { lat: 36.07, lng: -79.79 },
  charlotte: { lat: 35.23, lng: -80.84 },
  raleigh: { lat: 35.78, lng: -78.64 },
  wilmington: { lat: 34.24, lng: -77.87 },
  asheville: { lat: 35.6, lng: -82.55 },
  fayetteville: { lat: 35.05, lng: -78.88 },
  triangle: { lat: 35.85, lng: -78.85 },
};

function getCoords(county: string, lat?: number, lng?: number): { lat: number; lng: number } | null {
  if (lat !== undefined && lng !== undefined) return { lat, lng };
  const key = county.toLowerCase().trim();
  return COUNTY_COORDS[key] || null;
}

export default function CountyLink({ county, lat, lng, children, style, className }: CountyLinkProps) {
  const coords = getCoords(county, lat, lng);
  if (!coords) {
    return <span style={style} className={className}>{children || county}</span>;
  }

  return (
    <Link
      href={`/map?lat=${coords.lat}&lng=${coords.lng}&zoom=12`}
      className={className}
      style={{
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        borderBottom: "1px solid transparent",
        transition: "border-color 200ms ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderBottomColor = "var(--color-amber-rich)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderBottomColor = "transparent";
      }}
    >
      {children || county}
    </Link>
  );
}
