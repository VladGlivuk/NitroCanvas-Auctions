export interface CreateAuctionRequest {
  nftId: string;
  sellerId: string;
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  title: string;
  description?: string;
  contractAuctionId?: number;
}

export interface Auction {
  id: string;
  nftId: string;
  sellerId: string;
  startTime: string;
  endTime: string;
  status: 'active' | 'completed' | 'cancelled';
  contractAuctionId?: number;
  title: string;
  description?: string;
  highestBidder?: string;
  highestBid?: string;
  createdAt: string;
}
