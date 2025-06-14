import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AuctionTradePage: React.FC = () => {
  const { auctionId } = useParams();
  const [bidAmount, setBidAmount] = React.useState('');

  // Mock data for demonstration
  const auction = {
    id: auctionId,
    title: 'Example NFT',
    description: 'A unique piece of digital art created by a renowned digital artist. This piece represents the intersection of traditional art principles and modern digital technology.',
    currentPrice: '1.23 ETH',
    minBidIncrement: '0.1 ETH',
    timeLeft: '2 days',
    imageUrl: 'https://via.placeholder.com/200',
    creator: '0x1234...5678',
  };

  const handleBid = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle bid submission
    console.log('Bid submitted:', bidAmount);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{auction.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBid} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <div className="whitespace-pre-line px-3 py-2 rounded-md bg-background text-foreground border border-transparent">
                  {auction.description}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Current Price (ETH)</label>
                <div className="px-3 py-2 rounded-md bg-background text-foreground border border-transparent">
                  {auction.currentPrice}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Minimum Bid Increment (ETH)</label>
                <div className="px-3 py-2 rounded-md bg-background text-foreground border border-transparent">
                  {auction.minBidIncrement}
                </div>
              </div>
              <div>
                <label htmlFor="bidAmount" className="block text-sm font-medium mb-2">Your Bid (ETH)</label>
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
            </div>
            <Button type="submit" className="w-full">
              Place Bid
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuctionTradePage; 