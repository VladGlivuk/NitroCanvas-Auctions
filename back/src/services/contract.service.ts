import { ethers } from 'ethers';
import { env } from '../config/env';

const NFT_MARKETPLACE_ABI = [
  'function createAuction(address _nftContract, uint256 _tokenId, uint256 _startingPrice, uint256 _minBidIncrement, uint256 _duration) external returns (uint256)',
  'function placeBid(uint256 _auctionId) external payable',
  'function completeAuction(uint256 _auctionId) external',
  'function cancelAuction(uint256 _auctionId) external',
  'function getAuction(uint256 _auctionId) external view returns (address seller, address nftContract, uint256 tokenId, uint256 startingPrice, uint256 minBidIncrement, uint256 startTime, uint256 endTime, address highestBidder, uint256 highestBid, bool isActive)',
  'event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 startingPrice, uint256 startTime, uint256 endTime)',
  'event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)',
  'event AuctionCompleted(uint256 indexed auctionId, address indexed winner, uint256 amount)',
  'event AuctionCancelled(uint256 indexed auctionId)',
];

export class ContractService {
  private contract: ethers.Contract;
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(env.INFURA_URL);
    this.wallet = new ethers.Wallet(env.PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(env.CONTRACT_ADDRESS, NFT_MARKETPLACE_ABI, this.wallet);
  }

  async createAuction(nftContract: string, tokenId: string, startingPrice: string, minBidIncrement: string, duration: number): Promise<number> {
    const tx = await this.contract.createAuction(nftContract, tokenId, ethers.parseEther(startingPrice), ethers.parseEther(minBidIncrement), duration);
    const receipt = await tx.wait();

    // Get the auction ID from the event
    const event = receipt.logs.find((log: any) => log.fragment?.name === 'AuctionCreated');
    return event.args[0];
  }

  async placeBid(auctionId: number, bidAmount: string): Promise<void> {
    const tx = await this.contract.placeBid(auctionId, {
      value: ethers.parseEther(bidAmount),
    });
    await tx.wait();
  }

  async completeAuction(auctionId: number): Promise<void> {
    const tx = await this.contract.completeAuction(auctionId);
    await tx.wait();
  }

  async cancelAuction(auctionId: number): Promise<void> {
    const tx = await this.contract.cancelAuction(auctionId);
    await tx.wait();
  }

  async getAuction(auctionId: number): Promise<any> {
    const auction = await this.contract.getAuction(auctionId);
    return {
      seller: auction[0],
      nftContract: auction[1],
      tokenId: auction[2].toString(),
      startingPrice: ethers.formatEther(auction[3]),
      minBidIncrement: ethers.formatEther(auction[4]),
      startTime: new Date(Number(auction[5]) * 1000),
      endTime: new Date(Number(auction[6]) * 1000),
      highestBidder: auction[7],
      highestBid: ethers.formatEther(auction[8]),
      isActive: auction[9],
    };
  }

  // Event listeners
  onAuctionCreated(
    callback: (auctionId: number, seller: string, nftContract: string, tokenId: string, startingPrice: string, startTime: Date, endTime: Date) => void
  ) {
    this.contract.on('AuctionCreated', (auctionId, seller, nftContract, tokenId, startingPrice, startTime, endTime) => {
      callback(
        auctionId,
        seller,
        nftContract,
        tokenId.toString(),
        ethers.formatEther(startingPrice),
        new Date(Number(startTime) * 1000),
        new Date(Number(endTime) * 1000)
      );
    });
  }

  onBidPlaced(callback: (auctionId: number, bidder: string, amount: string) => void) {
    this.contract.on('BidPlaced', (auctionId, bidder, amount) => {
      callback(auctionId, bidder, ethers.formatEther(amount));
    });
  }

  onAuctionCompleted(callback: (auctionId: number, winner: string, amount: string) => void) {
    this.contract.on('AuctionCompleted', (auctionId, winner, amount) => {
      callback(auctionId, winner, ethers.formatEther(amount));
    });
  }

  onAuctionCancelled(callback: (auctionId: number) => void) {
    this.contract.on('AuctionCancelled', (auctionId) => {
      callback(auctionId);
    });
  }
}
