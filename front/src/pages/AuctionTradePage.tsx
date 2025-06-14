import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractRead, useContractWrite, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import {NftMarketplaceABI} from '../../NTFMarketplace';
import { NFTMarketplaceAddress } from '../contracts/NFTMarketplaceAddress';
import { toast } from 'sonner';

interface AuctionData {
  seller: string;
  nftContract: string;
  tokenId: bigint;
  startingPrice: bigint;
  minBidIncrement: bigint;
  highestBid: bigint;
  highestBidder: string;
  startTime: bigint;
  endTime: bigint;
  isActive: boolean;
}

export default function AuctionTradePage() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { address } = useAccount();
  const [bidAmount, setBidAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  // Fetch auction data
  const { data: auctionData, isLoading: isLoadingAuction } = useContractRead({
    address: NFTMarketplaceAddress,
    abi: NftMarketplaceABI,
    functionName: 'auctions',
    args: [auctionId ? BigInt(auctionId) : 0n],
  }) as { data: AuctionData | undefined, isLoading: boolean };

  // Place bid
  const { writeContract: placeBid, data: bidData } = useContractWrite({
    address: NFTMarketplaceAddress,
    abi: NftMarketplaceABI,
    functionName: 'placeBid',
  });

  const { isLoading: isBidLoading, isSuccess: isBidSuccess } = useWaitForTransactionReceipt({
    hash: bidData,
  });

  // Complete auction
  const { writeContract: completeAuction, data: completeData } = useContractWrite({
    address: NFTMarketplaceAddress,
    abi: NftMarketplaceABI,
    functionName: 'completeAuction',
  });

  const { isLoading: isCompleteLoading, isSuccess: isCompleteSuccess } = useWaitForTransactionReceipt({
    hash: completeData,
  });

  // Cancel auction
  const { writeContract: cancelAuction, data: cancelData } = useContractWrite({
    address: NFTMarketplaceAddress,
    abi: NftMarketplaceABI,
    functionName: 'cancelAuction',
  });

  const { isLoading: isCancelLoading, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({
    hash: cancelData,
  });

  useEffect(() => {
    if (isBidSuccess) {
      toast.success('Bid placed successfully!');
      setBidAmount('');
    }
  }, [isBidSuccess]);

  useEffect(() => {
    if (isCompleteSuccess) {
      toast.success('Auction completed successfully!');
      navigate('/');
    }
  }, [isCompleteSuccess, navigate]);

  useEffect(() => {
    if (isCancelSuccess) {
      toast.success('Auction cancelled successfully!');
      navigate('/');
    }
  }, [isCancelSuccess, navigate]);

  useEffect(() => {
    if (auctionData) {
      const updateTimeLeft = () => {
        const now = BigInt(Math.floor(Date.now() / 1000));
        const endTime = auctionData.endTime;
        
        if (now >= endTime) {
          setTimeLeft('Auction ended');
          return;
        }

        const timeLeftSeconds = Number(endTime - now);
        const hours = Math.floor(timeLeftSeconds / 3600);
        const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
        const seconds = timeLeftSeconds % 60;
        
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      };

      updateTimeLeft();
      const interval = setInterval(updateTimeLeft, 1000);
      return () => clearInterval(interval);
    }
  }, [auctionData]);

  const handlePlaceBid = () => {
    if (!bidAmount || !auctionId) return;
    
    try {
      const bidAmountWei = parseEther(bidAmount);
      placeBid({
        args: [BigInt(auctionId)],
        value: bidAmountWei,
      });
    } catch {
      toast.error('Invalid bid amount');
    }
  };

  const handleCompleteAuction = () => {
    if (!auctionId) return;
    completeAuction({
      args: [BigInt(auctionId)],
    });
  };

  const handleCancelAuction = () => {
    if (!auctionId) return;
    cancelAuction({
      args: [BigInt(auctionId)],
    });
  };

  if (isLoadingAuction) {
    return <div>Loading auction details...</div>;
  }

  if (!auctionData) {
    return <div>Auction not found</div>;
  }

  const isSeller = address?.toLowerCase() === auctionData.seller.toLowerCase();
  const canBid = !isSeller && auctionData.isActive;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Auction Details</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Auction Information</h2>
            <div className="space-y-4">
              <p><span className="font-medium">Seller:</span> {auctionData.seller}</p>
              <p><span className="font-medium">NFT Contract:</span> {auctionData.nftContract}</p>
              <p><span className="font-medium">Token ID:</span> {auctionData.tokenId.toString()}</p>
              <p><span className="font-medium">Starting Price:</span> {formatEther(auctionData.startingPrice)} ETH</p>
              <p><span className="font-medium">Minimum Bid Increment:</span> {formatEther(auctionData.minBidIncrement)} ETH</p>
              <p><span className="font-medium">Current Highest Bid:</span> {formatEther(auctionData.highestBid)} ETH</p>
              <p><span className="font-medium">Highest Bidder:</span> {auctionData.highestBidder}</p>
              <p><span className="font-medium">Time Left:</span> {timeLeft}</p>
              <p><span className="font-medium">Status:</span> {auctionData.isActive ? 'Active' : 'Ended'}</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Place Bid</h2>
            {canBid ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bid Amount (ETH)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="Enter bid amount"
                  />
                </div>
                <button
                  onClick={handlePlaceBid}
                  disabled={isBidLoading || !bidAmount}
                  className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {isBidLoading ? 'Placing Bid...' : 'Place Bid'}
                </button>
              </div>
            ) : (
              <p className="text-gray-500">
                {isSeller ? "You can't bid on your own auction" : "This auction is not active"}
              </p>
            )}

            {isSeller && auctionData.isActive && (
              <div className="mt-6 space-y-4">
                <button
                  onClick={handleCompleteAuction}
                  disabled={isCompleteLoading}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isCompleteLoading ? 'Completing...' : 'Complete Auction'}
                </button>
                <button
                  onClick={handleCancelAuction}
                  disabled={isCancelLoading}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400"
                >
                  {isCancelLoading ? 'Cancelling...' : 'Cancel Auction'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 