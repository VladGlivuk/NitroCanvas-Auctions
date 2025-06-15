// START OF CODE TO COPY AND PASTE INTO front/src/pages/AuctionTradePage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractWrite, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { NftMarketplaceABI } from '../../NTFMarketplace';
import { NFTMarketplaceAddress } from '../contracts/NFTMarketplaceAddress';
import { toast } from 'sonner';
import BiddingInterface from '../components/BiddingInterface';

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
  starting_price?: string; // ERC-7824 starting price in wei
  min_bid_increment?: string; // ERC-7824 minimum bid increment in wei
  created_at: string;
  erc7824_enabled?: boolean; // Whether this auction uses ERC-7824
  channel_id?: string; // ERC-7824 channel ID
}

export default function AuctionTradePage() {
  const { auctionId: dbAuctionId } = useParams(); // Rename to clarify it's the DB UUID from URL
  const navigate = useNavigate();
  const { address } = useAccount();

  const [auctionDetails, setAuctionDetails] = useState<FullAuctionData | null>(null);
  const [isLoadingAuctionDetails, setIsLoadingAuctionDetails] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Auction Details</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Auction Information */}
          <div className="lg:col-span-1">
            <h2 className="text-xl font-semibold mb-4">Auction Information</h2>
            <div className="space-y-4">
              <p><span className="font-medium">Seller:</span> {auctionDetails.seller_id}</p>
              <p><span className="font-medium">NFT Token ID:</span> {auctionDetails.nft_id}</p>
              <p><span className="font-medium">Time Left:</span> {timeLeft}</p>
              <p><span className="font-medium">Status:</span> {auctionDetails.status === 'active' ? 'Active' : 'Ended'}</p>
              <p><span className="font-medium">Title:</span> {auctionDetails.title}</p>
              {auctionDetails.description && <p><span className="font-medium">Description:</span> {auctionDetails.description}</p>}
            </div>

            {/* Seller Actions */}
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

          {/* ERC-7824 Bidding Interface */}
          <div className="lg:col-span-2">
            <BiddingInterface
              auctionId={auctionDetails.id}
              auctionData={{
                highest_bid: auctionDetails.highest_bid,
                highest_bidder: auctionDetails.highest_bidder,
                end_time: auctionDetails.end_time,
                status: auctionDetails.status,
                starting_price: auctionDetails.starting_price,
                min_bid_increment: auctionDetails.min_bid_increment
              }}
              userAddress={auctionDetails.seller_id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
