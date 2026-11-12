export interface FeedReportSummary {
  stores: number;
  shipments: number;
  otherReports: number;
  latestAt: string;
}

export const NC_SHIPMENT_EVENT = "nc_board_shipment_snapshot";
