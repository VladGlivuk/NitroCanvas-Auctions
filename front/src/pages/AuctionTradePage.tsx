import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

const AuctionTradePage: React.FC = () => {
  const { auctionId } = useParams();
  const [bidAmount, setBidAmount] = React.useState('');

  // Mock data for demonstration
  const auction = {
    id: auctionId,
    title: 'Rare Digital Art #1',
    description: 'A unique piece of digital art created by a renowned digital artist. This piece represents the intersection of traditional art principles and modern digital technology.',
    currentPrice: '1.5 ETH',
    minBidIncrement: '0.1 ETH',
    timeLeft: '2 days',
    imageUrl: 'https://via.placeholder.com/600',
    creator: '0x1234...5678',
    bids: [
      { bidder: '0xabcd...efgh', amount: '1.5 ETH', time: '2 hours ago' },
      { bidder: '0xijkl...mnop', amount: '1.4 ETH', time: '3 hours ago' },
    ],
  };

  const handleBid = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle bid submission
    console.log('Bid submitted:', bidAmount);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="aspect-square relative rounded-lg overflow-hidden">
            <img
              src={auction.imageUrl}
              alt={auction.title}
              className="object-cover w-full h-full"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>About this NFT</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{auction.description}</p>
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Creator</p>
                <p className="font-medium">{auction.creator}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Auction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Price</span>
                  <span className="text-2xl font-bold">{auction.currentPrice}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Minimum Bid Increment</span>
                  <span className="text-lg">{auction.minBidIncrement}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Time Left</span>
                  <span className="text-lg font-medium">{auction.timeLeft}</span>
                </div>
              </div>

              <form onSubmit={handleBid} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="bidAmount" className="block text-sm font-medium mb-2">
                    Your Bid (ETH)
                  </label>
                  <Input
                    id="bidAmount"
                    type="number"
                    step="0.01"
                    min={parseFloat(auction.currentPrice) + parseFloat(auction.minBidIncrement)}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="Enter bid amount"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Place Bid
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bid History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auction.bids.map((bid, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{bid.bidder}</p>
                      <p className="text-sm text-muted-foreground">{bid.time}</p>
                    </div>
                    <p className="font-bold">{bid.amount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AuctionTradePage; 