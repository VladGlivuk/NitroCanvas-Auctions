export type AuctionRequestType = {
    tokenId: string;
    contractAddress: string;
    startingPrice: string;
    minBidIncrement: string;
    duration: number;
    title: string;
    description: string;
}