export interface Auction {
  id: string;
  nftId: string;
  sellerId: string;
  startTime: Date;
  endTime: Date;
  status: "active" | "completed" | "cancelled";
  channelId: string;
  createdAt: Date;
}
