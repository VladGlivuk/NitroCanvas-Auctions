// START OF CODE TO COPY AND PASTE INTO front/src/pages/AuctionTradePage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractWrite, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { NftMarketplaceABI } from '../../NTFMarketplace';
import { NFTMarketplaceAddress } from '../contracts/NFTMarketplaceAddress';
import { toast } from 'sonner';

// Define the interface for data directly from the backend's database query
interface FullAuctionData {
  id: string; // Database UUID
  nft_id: string; // Token ID from payload (string, as per your auctions table without FK)
  seller_id: string; // Wallet address (as per your auctions table)
  start_time: string; // ISO string from DB
  end_time: string; // ISO string from DB
  status: 'active' | 'completed' | 'cancelled';
  contract_auction_id?: number; // Numeric ID for blockchain, stored in DB
  title: string;
  description?: string;
  highest_bidder?: string; // Wallet address
  highest_bid?: string; // Decimal string
  created_at: string;
}

export default function AuctionTradePage() {
  const { auctionId: dbAuctionId } = useParams(); // Rename to clarify it's the DB UUID from URL
  const navigate = useNavigate();
  const { address } = useAccount();

  const [auctionDetails, setAuctionDetails] = useState<FullAuctionData | null>(null);
  const [isLoadingAuctionDetails, setIsLoadingAuctionDetails] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  // No direct useContractRead here for fetching auction data; it comes from backend

  // Place bid
  const { writeContract: placeBid, data: bidData } = useContractWrite();
  const { isLoading: isBidLoading, isSuccess: isBidSuccess } = useWaitForTransactionReceipt({ hash: bidData, });

  // Complete auction
  const { writeContract: completeAuction, data: completeData } = useContractWrite();
  const { isLoading: isCompleteLoading, isSuccess: isCompleteSuccess } = useWaitForTransactionReceipt({ hash: completeData, });

  // Cancel auction
  const { writeContract: cancelAuction, data: cancelData } = useContractWrite();
  const { isLoading: isCancelLoading, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({ hash: cancelData, });

  // Effect to fetch auction details from OUR backend API (initial fetch)
  useEffect(() => {
    const fetchAuctionDetails = async () => {
      if (!dbAuctionId) {
        setIsLoadingAuctionDetails(false);
        return;
      }
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${dbAuctionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch auction details from backend');
        }
        const data: FullAuctionData = await response.json();
        setAuctionDetails(data);
      } catch (error) {
        console.error('Error fetching auction details:', error);
        toast.error('Failed to load auction details.');
      } finally {
        setIsLoadingAuctionDetails(false);
      }
    };
    fetchAuctionDetails();
  }, [dbAuctionId]);

  // Effect to update timeLeft based on database endTime
  useEffect(() => {
    if (auctionDetails) {
      const updateTimeLeft = () => {
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const endTime = Math.floor(new Date(auctionDetails.end_time).getTime() / 1000); // DB end time in seconds
        
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
  }, [auctionDetails]); // Depend on auctionDetails

  // Effects for transaction success (re-fetch data to update UI)
  useEffect(() => {
    if (isBidSuccess) {
      toast.success('Bid placed successfully!');
      setBidAmount('');
      // Re-fetch database auction details to update UI after a bid
      if (dbAuctionId) {
        fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${dbAuctionId}`)
          .then(res => {
            if (!res.ok) throw new Error('Failed to re-fetch auction after bid');
            return res.json();
          })
          .then(data => setAuctionDetails(data))
          .catch(err => console.error('Failed to re-fetch auction after bid:', err));
      }
    }
  }, [isBidSuccess, dbAuctionId]);

  useEffect(() => {
    if (isCompleteSuccess) {
      toast.success('Auction completed successfully on blockchain!');
      if (dbAuctionId && address) {
        fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${dbAuctionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerId: address }),
        })
        .then(response => {
          if (!response.ok) throw new Error('Failed to complete auction in database');
          return response.json();
        })
        .then(() => {
          toast.success('Auction status updated in database!');
          navigate('/');
        })
        .catch(error => {
          console.error('Error updating auction in database:', error);
          toast.error('Failed to update auction status in database');
        });
      }
    }
  }, [isCompleteSuccess, dbAuctionId, address, navigate]);

  useEffect(() => {
    if (isCancelSuccess) {
      toast.success('Auction cancelled successfully!');
      // Update local state or re-fetch to reflect cancellation
      if (dbAuctionId) {
         fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${dbAuctionId}`)
          .then(res => {
            if (!res.ok) throw new Error('Failed to re-fetch auction after cancel');
            return res.json();
          })
          .then(data => setAuctionDetails(data))
          .catch(err => console.error('Failed to re-fetch auction after cancel:', err));
      }
      navigate('/');
    }
  }, [isCancelSuccess, navigate, dbAuctionId]);

  const handlePlaceBid = () => {
    // Use contractAuctionId from fetched auctionDetails for contract calls
    if (!bidAmount || !auctionDetails || auctionDetails.contract_auction_id === undefined) return;
    
    try {
      const bidAmountWei = parseEther(bidAmount);
      placeBid({
        address: NFTMarketplaceAddress,
        abi: NftMarketplaceABI,
        functionName: 'placeBid',
        args: [BigInt(auctionDetails.contract_auction_id)], // Use contractAuctionId
        value: bidAmountWei,
      });
    } catch {
      toast.error('Invalid bid amount');
    }
  };

  const handleCompleteAuction = () => {
    // Use contractAuctionId from fetched auctionDetails for contract calls
    if (!auctionDetails || auctionDetails.contract_auction_id === undefined) return;
    completeAuction({
      address: NFTMarketplaceAddress,
      abi: NftMarketplaceABI,
      functionName: 'completeAuction',
      args: [BigInt(auctionDetails.contract_auction_id)], // Use contractAuctionId
    });
  };

  const handleCancelAuction = () => {
    if (!auctionDetails || auctionDetails.contract_auction_id === undefined) return;
    cancelAuction({
      address: NFTMarketplaceAddress,
      abi: NftMarketplaceABI,
      functionName: 'cancelAuction',
      args: [BigInt(auctionDetails.contract_auction_id)], // Use contractAuctionId
    });
  };

  if (isLoadingAuctionDetails) { 
    return <div>Loading auction details...</div>;
  }

  if (!auctionDetails) { 
    return <div>Auction not found</div>;
  }

  // Use database data for display and logic
  const isSeller = address?.toLowerCase() === auctionDetails.seller_id.toLowerCase();
  const canBid = !isSeller && auctionDetails.status === 'active';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Auction Details</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Auction Information</h2>
            <div className="space-y-4">
              <p><span className="font-medium">Seller:</span> {auctionDetails.seller_id}</p>
              <p><span className="font-medium">NFT Token ID:</span> {auctionDetails.nft_id}</p>
              {/* Note: NFT Contract Address is not directly available from the current DB fetch */}
              <p><span className="font-medium">Starting Price:</span> (Not available from DB directly)</p>
              <p><span className="font-medium">Minimum Bid Increment:</span> (Not available from DB directly)</p>
              <p><span className="font-medium">Current Highest Bid:</span> {auctionDetails.highest_bid ? formatEther(BigInt(auctionDetails.highest_bid)) : '0'} ETH</p>
              <p><span className="font-medium">Highest Bidder:</span> {auctionDetails.highest_bidder || 'None'}</p>
              <p><span className="font-medium">Time Left:</span> {timeLeft}</p>
              <p><span className="font-medium">Status:</span> {auctionDetails.status === 'active' ? 'Active' : 'Ended'}</p>
              <p><span className="font-medium">Title:</span> {auctionDetails.title}</p>
              {auctionDetails.description && <p><span className="font-medium">Description:</span> {auctionDetails.description}</p>}
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
                {isSeller ? "You can't bid on your own auction" : `This auction is ${auctionDetails.status}`}
              </p>
            )}

            {isSeller && auctionDetails.status === 'active' && (
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
// END OF CODE TO COPY AND PASTE