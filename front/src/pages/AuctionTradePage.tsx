import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWeb3 } from '@/shared/contexts/Web3Context';
import { toast } from 'sonner';

interface Auction {
  id: string;
  title: string;
  description: string;
  currentPrice: string;
  minBidIncrement: string;
  timeLeft: string;
  imageUrl: string;
  creator: string;
  status: 'active' | 'completed' | 'cancelled';
  contractAuction: {
    seller: string;
    highestBidder: string;
    highestBid: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  };
}

const AuctionTradePage: React.FC = () => {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { account } = useWeb3();
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    fetchAuctionDetails();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [auctionId]);

  const fetchAuctionDetails = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auctions/${auctionId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch auction details');
      }
      setAuction(data);
    } catch (error) {
      console.error('Error fetching auction details:', error);
      toast.error(error.message || 'Failed to fetch auction details');
    }
  };

  const updateTimeLeft = () => {
    if (!auction?.contractAuction?.endTime) return;

    const endTime = new Date(auction.contractAuction.endTime).getTime();
    const now = new Date().getTime();
    const distance = endTime - now;

    if (distance < 0) {
      setTimeLeft('Auction ended');
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
  };

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auctions/${auctionId}/bid`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ bidAmount }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to place bid');
      }

      toast.success('Bid placed successfully!');
      setBidAmount('');
      fetchAuctionDetails();
    } catch (error) {
      console.error('Error placing bid:', error);
      toast.error(error.message || 'Failed to place bid');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAuction = async () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auctions/${auctionId}/complete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to complete auction');
      }

      toast.success('Auction completed successfully!');
      fetchAuctionDetails();
    } catch (error) {
      console.error('Error completing auction:', error);
      toast.error(error.message || 'Failed to complete auction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAuction = async () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auctions/${auctionId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel auction');
      }

      toast.success('Auction cancelled successfully!');
      fetchAuctionDetails();
    } catch (error) {
      console.error('Error cancelling auction:', error);
      toast.error(error.message || 'Failed to cancel auction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!auction) {
    return <div>Loading...</div>;
  }

  const isSeller = account?.toLowerCase() === auction.contractAuction.seller.toLowerCase();
  const isHighestBidder = account?.toLowerCase() === auction.contractAuction.highestBidder.toLowerCase();
  const canBid = auction.status === 'active' && !isSeller;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-3xl">{auction.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <div>
              <label className="block text-sm font-medium mb-3">Description</label>
              <div className="whitespace-pre-line px-4 py-3 rounded-md bg-background text-foreground border border-transparent">
                {auction.description}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Current Price (ETH)</label>
              <div className="px-4 py-3 rounded-md bg-background text-foreground border border-transparent">
                {auction.contractAuction.highestBid || auction.currentPrice}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Minimum Bid Increment (ETH)</label>
              <div className="px-4 py-3 rounded-md bg-background text-foreground border border-transparent">
                {auction.minBidIncrement}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Time Left</label>
              <div className="px-4 py-3 rounded-md bg-background text-foreground border border-transparent">
                {timeLeft}
              </div>
            </div>

            {canBid && (
              <form onSubmit={handleBid} className="space-y-6">
                <div>
                  <label htmlFor="bidAmount" className="block text-sm font-medium mb-3">
                    Your Bid (ETH)
                  </label>
                  <Input
                    id="bidAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter your bid"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="bg-input text-foreground border-border placeholder:text-muted-foreground"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Placing Bid...' : 'Place Bid'}
                </Button>
              </form>
            )}

            {isSeller && auction.status === 'active' && (
              <div className="space-y-4">
                <Button
                  onClick={handleCompleteAuction}
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Completing...' : 'Complete Auction'}
                </Button>
                <Button
                  onClick={handleCancelAuction}
                  variant="destructive"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Cancelling...' : 'Cancel Auction'}
                </Button>
              </div>
            )}

            {auction.status !== 'active' && (
              <div className="text-center py-6">
                <p className="text-lg font-semibold">
                  {auction.status === 'completed'
                    ? `Auction completed. ${isHighestBidder ? 'You won!' : 'You did not win.'}`
                    : 'Auction cancelled'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuctionTradePage; 