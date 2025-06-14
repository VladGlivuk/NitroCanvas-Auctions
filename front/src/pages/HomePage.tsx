import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Link } from 'react-router-dom';
import { useWeb3 } from '@/shared/contexts/Web3Context';
import { toast } from 'sonner';

interface Auction {
  id: string;
  title: string;
  description: string;
  currentPrice: string;
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

const HomePage: React.FC = () => {
  const { isConnected } = useWeb3();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAuctions();
    const interval = setInterval(fetchAuctions, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchAuctions = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch auctions');
      }
      setAuctions(data);
    } catch (error) {
      console.error('Error fetching auctions:', error);
      toast.error(error.message || 'Failed to fetch auctions');
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeLeft = (endTime: string) => {
    const end = new Date(endTime).getTime();
    const now = new Date().getTime();
    const distance = end - now;

    if (distance < 0) {
      return 'Auction ended';
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}d ${hours}h left`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    } else {
      return `${minutes}m left`;
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to NFT Auctions</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Connect your wallet to start exploring and participating in NFT auctions
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-xl">Loading auctions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">Active Auctions</h1>
        <Link to="/create-auction">
          <Button>Create Auction</Button>
        </Link>
      </div>
      {auctions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl text-muted-foreground mb-6">No active auctions found</p>
          <Link to="/create-auction" className="inline-block">
            <Button>Create Your First Auction</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {auctions.map((auction) => (
            <Card key={auction.id} className="overflow-hidden">
              <div className="aspect-square relative">
                <img
                  src={auction.imageUrl}
                  alt={auction.title}
                  className="object-cover w-full h-full"
                />
              </div>
              <CardHeader>
                <CardTitle>{auction.title}</CardTitle>
                <CardDescription>{auction.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Price</p>
                    <p className="text-xl font-bold">
                      {auction.contractAuction.highestBid || auction.currentPrice} ETH
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time Left</p>
                    <p className="text-xl font-bold">
                      {getTimeLeft(auction.contractAuction.endTime)}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Link to={`/auction/${auction.id}`} className="w-full">
                  <Button className="w-full">View Auction</Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomePage;
