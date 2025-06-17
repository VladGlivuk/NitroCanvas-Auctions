import { useState, useEffect, useRef } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { toast } from 'sonner';

// Utility to fetch ETH price in USD
const fetchEthPrice = async (): Promise<number> => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return data.ethereum.usd;
  } catch (error) {
    console.warn('Failed to fetch ETH price:', error);
    return 3300; // Fallback price
  }
};

// Convert ETH to USD
const ethToUsd = (ethAmount: string, ethPrice: number): string => {
  const eth = parseFloat(ethAmount);
  const usd = eth * ethPrice;
  return usd.toFixed(2);
};

interface BidData {
  bidder_id: string;
  amount: string;
  timestamp: string;
  nonce: number;
  status?: string;
}

interface BiddingInterfaceProps {
  auctionId: string;
  auctionData: {
    highest_bid?: string;
    highest_bidder?: string;
    end_time: string;
    status: string;
    starting_price?: string;
    min_bid_increment?: string;
  };
  userAddress?: string;
  onBidPlaced?: () => void;
}

export default function BiddingInterface({ 
  auctionId, 
  auctionData, 
  userAddress,
  onBidPlaced
}: BiddingInterfaceProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  
  const [bids, setBids] = useState<BidData[]>([]);
  const [newBidAmount, setNewBidAmount] = useState('');
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [bidNonce, setBidNonce] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [ethPrice, setEthPrice] = useState(3300);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection for real-time bid updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          ws.send(JSON.stringify({
            type: 'subscribe',
            auctionId: auctionId
          }));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);
            
            if (data.type === 'bid_update' && data.auctionId === auctionId) {
              fetchBids();
            } else if (data.type === 'subscribed') {
              console.log(`Subscribed to auction ${data.auctionId}`);
            } else if (data.type === 'auction_completed' && data.auctionId === auctionId) {
              if (data.winner === address) {
                toast.success(`🎉 Congratulations! You won this auction!`);
              } else {
                toast.info(`📢 This auction has been completed. Winner: ${data.winner.slice(0, 6)}...${data.winner.slice(-4)}`);
              }
            } else if (data.type === 'auction_cancelled' && data.auctionId === auctionId) {
              toast.info(`📢 This auction has been cancelled by the seller`);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [auctionId]);

  // Fetch current bids
  const fetchBids = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/bids/${auctionId}`);
      if (response.ok) {
        const data = await response.json();
        setBids(data.bids || []);
      }
    } catch (error) {
      console.error('Error fetching bids:', error);
    }
  };

  // Initial bid fetch and ETH price fetch
  useEffect(() => {
    fetchBids();
    fetchEthPrice().then(setEthPrice);
  }, [auctionId]);

  // Generate nonce for bid
  useEffect(() => {
    setBidNonce(Date.now());
  }, []);

  const handlePlaceBid = async () => {
    if (!address || !newBidAmount) {
      toast.error('Please connect wallet and enter bid amount');
      return;
    }

    if (auctionData.status !== 'active') {
      toast.error('Auction is not active');
      return;
    }

    try {
      setIsPlacingBid(true);
      
      const bidAmountWei = parseEther(newBidAmount);
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = bidNonce + 1;
      
      // Validate bid amount
      const currentHighest = auctionData.highest_bid ? BigInt(auctionData.highest_bid) : 0n;
      const startingPrice = auctionData.starting_price ? BigInt(auctionData.starting_price) : 0n;
      const minIncrement = auctionData.min_bid_increment ? BigInt(auctionData.min_bid_increment) : parseEther('0.01');
      
      const hasBids = currentHighest > 0n;
      const minBid = hasBids ? currentHighest + minIncrement : startingPrice;
      
      if (bidAmountWei < minBid) {
        toast.error(`Bid must be at least ${formatEther(minBid)} ETH`);
        return;
      }

      // Create EIP-712 typed data for signature
      const domain = {
        name: 'NFTMarketplaceAuction',
        version: '1',
        chainId: 11155111, // Sepolia
        verifyingContract: import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`
      };

      const types = {
        Bid: [
          { name: 'auctionId', type: 'string' },
          { name: 'bidder', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' }
        ]
      };

      const value = {
        auctionId: auctionId,
        bidder: address,
        amount: bidAmountWei,
        nonce: BigInt(nonce),
        timestamp: BigInt(timestamp)
      };

      // Sign the bid using EIP-712
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Bid',
        message: value
      });

      console.log('Bid signature created:', signature);

      // Submit bid to backend
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/bids`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          auctionId,
          amount: bidAmountWei.toString(),
          signature,
          nonce,
          timestamp,
          bidder: address
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Bid placed successfully!');
        setNewBidAmount('');
        setBidNonce(nonce);
        
        setBids(result.bids || []);
        
        if (onBidPlaced) {
          onBidPlaced();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to place bid');
      }

    } catch (error) {
      console.error('Error placing bid:', error);
      toast.error('Failed to place bid');
    } finally {
      setIsPlacingBid(false);
    }
  };

  const formatTimeLeft = () => {
    const now = new Date().getTime();
    const endTime = new Date(auctionData.end_time).getTime();
    const timeLeft = endTime - now;
    
    if (timeLeft <= 0) return 'Auction ended';
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const isOwner = address?.toLowerCase() === userAddress?.toLowerCase();
  const canBid = address && !isOwner && auctionData.status === 'active';

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg p-6 text-gray-100">
      {/* Connection Status */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span className="text-sm text-gray-600">
          {isConnected ? 'Live updates active' : 'Reconnecting...'}
        </span>
      </div>

      {/* Current Highest Bid */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Current Highest Bid</h3>
        <div className="text-3xl font-bold text-blue-600">
          {(() => {
            const currentBid = auctionData.highest_bid ? formatEther(BigInt(auctionData.highest_bid)) : '0';
            const hasBids = currentBid !== '0' && auctionData.highest_bidder && auctionData.highest_bidder !== '0x0000000000000000000000000000000000000000';
            
            if (hasBids) {
              const usdValue = ethToUsd(currentBid, ethPrice);
              return (
                <>
                  {currentBid} ETH
                  <span className="text-lg font-normal text-gray-500 ml-2">
                    (~${usdValue} USD)
                  </span>
                </>
              );
            } else {
              const isFinished = auctionData.status !== 'active';
              return (
                <>
                  {isFinished ? 'Auction ended with no bids' : 'No bids yet'}
                </>
              );
            }
          })()}
        </div>
        {auctionData.highest_bidder && auctionData.highest_bidder !== '0x0000000000000000000000000000000000000000' ? (
          <p className="text-sm text-gray-600">
            by {auctionData.highest_bidder.slice(0, 6)}...{auctionData.highest_bidder.slice(-4)}
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Starting price: {auctionData.starting_price ? formatEther(BigInt(auctionData.starting_price)) : '0'} ETH (~${auctionData.starting_price ? ethToUsd(formatEther(BigInt(auctionData.starting_price)), ethPrice) : '0'} USD)
          </p>
        )}
      </div>

      {/* Bidding Form */}
      {canBid ? (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Place Your Bid</h3>
          {(() => {
            const currentHighest = auctionData.highest_bid ? BigInt(auctionData.highest_bid) : 0n;
            const startingPrice = auctionData.starting_price ? BigInt(auctionData.starting_price) : 0n;
            const minIncrement = auctionData.min_bid_increment ? BigInt(auctionData.min_bid_increment) : parseEther('0.01');
            
            const hasBids = currentHighest > 0n;
            const minBid = hasBids ? currentHighest + minIncrement : startingPrice;
            const minBidEth = formatEther(minBid);
            const minBidUsd = ethToUsd(minBidEth, ethPrice);
            
            return (
              <>
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-blue-700 font-medium">
                      💡 Next bid must be at least: <span className="font-bold">{minBidEth} ETH (~${minBidUsd} USD)</span>
                    </p>
                    <button
                      onClick={() => setNewBidAmount(minBidEth)}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      disabled={isPlacingBid}
                    >
                      Use Min
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    value={newBidAmount}
                    onChange={(e) => setNewBidAmount(e.target.value)}
                    placeholder={`Enter at least ${minBidEth} ETH (~$${minBidUsd})`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isPlacingBid}
                    min={minBidEth}
                  />
                  <button
                    onClick={handlePlaceBid}
                    disabled={isPlacingBid || !newBidAmount}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isPlacingBid ? 'Placing...' : 'Bid'}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="mb-6 p-4 bg-gray-100 rounded-md">
          <p className="text-gray-600">
            {!address 
              ? 'Connect your wallet to place bids'
              : isOwner 
                ? "You can't bid on your own auction"
                : auctionData.status !== 'active'
                  ? 'This auction is not active'
                  : 'Unable to bid'
            }
          </p>
        </div>
      )}

      {/* Bid History */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Bid History</h3>
        <div className="max-h-60 overflow-y-auto">
          {bids.length > 0 ? (
            <div className="space-y-2">
              {bids.map((bid, index) => (
                <div
                  key={index}
                  className="flex justify-between items-start p-3 bg-gray-800 rounded-md min-h-[60px]"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-100">
                      {formatEther(BigInt(bid.amount))} ETH
                    </div>
                    <div className="text-sm text-gray-300">
                      {bid.bidder_id.slice(0, 6)}...{bid.bidder_id.slice(-4)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-sm text-gray-400">
                      {new Date(bid.timestamp).toLocaleTimeString()}
                    </div>
                    {bid.status && (
                      <div className={`text-xs px-2 py-1 rounded mt-1 ${
                        bid.status === 'valid' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {bid.status}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No bids yet</p>
          )}
        </div>
      </div>
    </div>
  );
}