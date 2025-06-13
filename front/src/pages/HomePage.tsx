import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Link } from 'react-router-dom';
import { useWeb3 } from '@/shared/contexts/Web3Context';

const HomePage: React.FC = () => {
  const { isConnected } = useWeb3();

  // Mock data for demonstration
  const auctions = [
    {
      id: '1',
      title: 'Rare Digital Art #1',
      description: 'A unique piece of digital art',
      currentPrice: '1.5 ETH',
      timeLeft: '2 days',
      imageUrl: 'https://via.placeholder.com/300',
    },
    {
      id: '2',
      title: 'Crypto Punk #1234',
      description: 'One of the original CryptoPunks',
      currentPrice: '5.0 ETH',
      timeLeft: '1 day',
      imageUrl: 'https://via.placeholder.com/300',
    },
    // Add more mock auctions as needed
  ];

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

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Active Auctions</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <p className="text-xl font-bold">{auction.currentPrice}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Time Left</p>
                  <p className="text-xl font-bold">{auction.timeLeft}</p>
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
    </div>
  );
};

export default HomePage;
