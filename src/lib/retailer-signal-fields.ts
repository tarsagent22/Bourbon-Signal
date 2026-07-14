export type RetailerSignalKind = "bottle_drop" | "barrel_pick" | "tasting" | "lottery" | "other";

export type RetailerSignalFieldConfig = {
  useBottleSuggestions: boolean;
  supportsAvailabilityTiming: boolean;
  titleLabel: string;
  titlePlaceholder: string;
  titleHelp: string;
  locationLabel: string;
  locationPlaceholder: string;
  showPrice: boolean;
  priceLabel: string;
  pricePlaceholder: string;
  showAvailability: boolean;
  availabilityLabel: string;
  availabilityPlaceholder: string;
  expiresAtLabel: string;
  expiresAtRequired: boolean;
  notesLabel: string;
  notesPlaceholder: string;
};

const configs: Record<RetailerSignalKind, RetailerSignalFieldConfig> = {
  bottle_drop: {
    useBottleSuggestions: true,
    supportsAvailabilityTiming: true,
    titleLabel: "Bottle",
    titlePlaceholder: "Start typing a bottle name…",
    titleHelp: "Choose a Bottle Check suggestion or keep your own bottle name if it is not listed.",
    locationLabel: "Where customers can find it",
    locationPlaceholder: "Front counter, allocated shelf…",
    showPrice: true,
    priceLabel: "Price",
    pricePlaceholder: "$79.99",
    showAvailability: true,
    availabilityLabel: "Quantity or purchase limit",
    availabilityPlaceholder: "12 bottles, limit one",
    expiresAtLabel: "Available until",
    expiresAtRequired: false,
    notesLabel: "Purchase details",
    notesPlaceholder: "Any instructions customers should know…",
  },
  barrel_pick: {
    useBottleSuggestions: true,
    supportsAvailabilityTiming: true,
    titleLabel: "Barrel pick bottle",
    titlePlaceholder: "Start typing the bottle name…",
    titleHelp: "Choose the base bottle from Bottle Check or enter the pick name yourself.",
    locationLabel: "Pickup location",
    locationPlaceholder: "Store counter, tasting room…",
    showPrice: true,
    priceLabel: "Bottle price",
    pricePlaceholder: "$89.99",
    showAvailability: true,
    availabilityLabel: "Quantity or purchase limit",
    availabilityPlaceholder: "96 bottles, limit two",
    expiresAtLabel: "Release ends",
    expiresAtRequired: false,
    notesLabel: "Pick details",
    notesPlaceholder: "Barrel number, proof, release instructions…",
  },
  tasting: {
    useBottleSuggestions: false,
    supportsAvailabilityTiming: false,
    titleLabel: "Event name",
    titlePlaceholder: "Summer bourbon tasting",
    titleHelp: "Use the public event name customers will recognize.",
    locationLabel: "Event location",
    locationPlaceholder: "Tasting room or full event address",
    showPrice: true,
    priceLabel: "Ticket price",
    pricePlaceholder: "$25 or Free",
    showAvailability: true,
    availabilityLabel: "Capacity or reservation details",
    availabilityPlaceholder: "30 seats, reservation required",
    expiresAtLabel: "Event date and time",
    expiresAtRequired: true,
    notesLabel: "Tasting details",
    notesPlaceholder: "Featured bottles, age requirements, reservation instructions…",
  },
  lottery: {
    useBottleSuggestions: true,
    supportsAvailabilityTiming: false,
    titleLabel: "Bottle or lottery name",
    titlePlaceholder: "Start typing a bottle or enter the lottery name…",
    titleHelp: "Choose a featured bottle when possible, or enter the retailer's lottery name.",
    locationLabel: "How customers enter",
    locationPlaceholder: "Store counter or entry URL",
    showPrice: true,
    priceLabel: "Entry cost",
    pricePlaceholder: "Free or $10",
    showAvailability: true,
    availabilityLabel: "Eligibility or bottle count",
    availabilityPlaceholder: "Residents only, 6 bottles available",
    expiresAtLabel: "Entry deadline",
    expiresAtRequired: true,
    notesLabel: "Drawing and pickup details",
    notesPlaceholder: "Drawing date, winner contact, pickup window…",
  },
  other: {
    useBottleSuggestions: false,
    supportsAvailabilityTiming: false,
    titleLabel: "Signal title",
    titlePlaceholder: "What should customers know?",
    titleHelp: "Give customers a short, specific description.",
    locationLabel: "Location or URL",
    locationPlaceholder: "Where customers should go",
    showPrice: false,
    priceLabel: "Price",
    pricePlaceholder: "$0.00",
    showAvailability: false,
    availabilityLabel: "Availability",
    availabilityPlaceholder: "",
    expiresAtLabel: "End date and time",
    expiresAtRequired: false,
    notesLabel: "Customer details",
    notesPlaceholder: "Add the information customers need to act on this signal…",
  },
};

export function retailerSignalFieldConfig(kind: RetailerSignalKind): RetailerSignalFieldConfig {
  return configs[kind];
}
