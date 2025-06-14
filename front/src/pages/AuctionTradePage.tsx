import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from 'lucide-react';

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
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <h1 className="text-4xl font-bold mb-6 text-foreground">NFT Auction</h1>

      <Tabs defaultValue="auction" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="auction">Auction</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="auction" className="pt-4 space-y-6">
          {/* Example NFT Card */}
          <Card className="bg-card text-card-foreground p-6 rounded-lg shadow-md flex items-center gap-6">
            <div className="w-32 h-32 bg-gray-700 rounded-md flex-shrink-0">
              {/* Placeholder for NFT Image */}
              <img src={auction.imageUrl} alt="NFT" className="w-full h-full object-cover rounded-md" />
            </div>
            <div className="flex-grow">
              <CardTitle className="text-2xl font-bold text-foreground">{auction.title}</CardTitle>
              <p className="text-muted-foreground mt-1">Current bid: {auction.currentPrice}</p>
              <div className="mt-4 flex gap-2">
                <Input
                  type="number"
                  placeholder="Enter your bid"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="flex-grow bg-input text-foreground border-border placeholder:text-muted-foreground"
                />
                <Button onClick={handleBid} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Place Bid
                </Button>
              </div>
            </div>
          </Card>

          {/* Escrow Protection Card */}
          <Card className="bg-card text-card-foreground p-6 rounded-lg shadow-md flex items-center gap-4">
            <ShieldCheck className="h-8 w-8 text-primary flex-shrink-0" />
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">Escrow Protection</CardTitle>
              <CardContent className="p-0 mt-1 text-muted-foreground">
                Your funds are secured until the auction is finalized.
              </CardContent>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          {/* Bid History (to be implemented later) */}
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuctionTradePage; 