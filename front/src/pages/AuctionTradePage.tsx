// START OF CODE TO COPY AND PASTE INTO front/src/pages/AuctionTradePage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
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
  const [isSettling, setIsSettling] = useState(false);


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
        console.log('data', data);
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

  const refreshAuctionDetails = async () => {
    if (!dbAuctionId) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${dbAuctionId}`);
      if (response.ok) {
        const data: FullAuctionData = await response.json();
        setAuctionDetails(data);
        console.log('Auction details refreshed after bid:', data);
      }
    } catch (error) {
      console.error('Error refreshing auction details:', error);
    }
  };

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

  // WebSocket effect for real-time notifications
  useEffect(() => {
    if (!dbAuctionId) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected for auction notifications');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);

        if (data.type === 'auction_completed' && data.auctionId === dbAuctionId) {
          // Show notification about auction completion
          if (data.winner === address) {
            toast.success(`🎉 Congratulations! You won the auction "${data.title}" with a bid of ${data.winningAmount} ETH!`);
          } else if (data.sellerId === address) {
            toast.success(`✅ Your auction "${data.title}" has been completed! Winner: ${data.winner.slice(0, 6)}...${data.winner.slice(-4)}`);
          } else {
            toast.info(`📢 Auction "${data.title}" has been completed. Winner: ${data.winner.slice(0, 6)}...${data.winner.slice(-4)}`);
          }
        }

        if (data.type === 'auction_redirect' && data.auctionId === dbAuctionId) {
          // Show redirect message and navigate to home
          toast.info(data.message);
          setTimeout(() => {
            navigate('/');
          }, 3000); // 3 second delay to let user read the message
        }

        if (data.type === 'auction_cancelled' && data.auctionId === dbAuctionId) {
          // Show cancellation message and redirect
          if (data.sellerId === address) {
            toast.success(`✅ You have successfully cancelled auction "${data.title}"`);
          } else {
            toast.info(`📢 Auction "${data.title}" has been cancelled by the seller`);
          }
          setTimeout(() => {
            navigate('/');
          }, 3000);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [dbAuctionId, address, navigate]);

  const handleCompleteAuction = async () => {
    console.log('handleCompleteAuction called');
    console.log('auctionDetails:', auctionDetails);
    
    if (!auctionDetails) {
      console.log('Early return: missing auction details');
      toast.error('Auction details not loaded');
      return;
    }
    
    try {
      setIsSettling(true);
      
      // Call backend API to settle the auction (handles ERC-7824 logic)
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${auctionDetails.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        await response.json();
        toast.success('Auction completed successfully!');
        
        // Refresh auction details
        const updatedResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${auctionDetails.id}`);
        if (updatedResponse.ok) {
          const updatedData = await updatedResponse.json();
          setAuctionDetails(updatedData);
        }
      } else {
        const error = await response.json();
        console.error('Settlement error:', error);
        toast.error(error.message || 'Failed to complete auction');
      }
    } catch (error) {
      console.error('Error completing auction:', error);
      toast.error('Failed to complete auction');
    } finally {
      setIsSettling(false);
    }
  };

  const handleCancelAuction = async () => {
    console.log('handleCancelAuction called');
    console.log('auctionDetails:', auctionDetails);
    
    if (!auctionDetails || !address) {
      toast.error('Missing auction details or wallet connection');
      return;
    }
    
    try {
      setIsSettling(true);
      
      // Call backend API to cancel the auction
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${auctionDetails.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          sellerId: address
        })
      });

      if (response.ok) {
        toast.success('Auction cancelled successfully!');
        
        // Refresh auction details
        const updatedResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/${auctionDetails.id}`);
        if (updatedResponse.ok) {
          const updatedData = await updatedResponse.json();
          setAuctionDetails(updatedData);
        }
        
        // Navigate back to home
        navigate('/');
      } else {
        const error = await response.json();
        console.error('Cancel error:', error);
        toast.error(error.message || 'Failed to cancel auction');
      }
    } catch (error) {
      console.error('Error cancelling auction:', error);
      toast.error('Failed to cancel auction');
    } finally {
      setIsSettling(false);
    }
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
      <div className="max-w-4xl mx-auto bg-gray-900 rounded-lg shadow-lg p-6 text-gray-100">
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
                  disabled={isSettling}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isSettling ? 'Settling...' : 'Complete Auction'}
                </button>
                <button
                  onClick={handleCancelAuction}
                  disabled={isSettling}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400"
                >
                  {isSettling ? 'Cancelling...' : 'Cancel Auction'}
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
              onBidPlaced={refreshAuctionDetails}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
