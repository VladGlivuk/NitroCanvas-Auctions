import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '@/shared/contexts/Web3Context';
import { toast } from 'sonner';

const CreateAuction: React.FC = () => {
  const navigate = useNavigate();
  const { account } = useWeb3();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    nftAddress: '',
    tokenId: '',
    initialPrice: '',
    minBidIncrement: '',
    auctionDuration: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          tokenId: formData.tokenId,
          contractAddress: formData.nftAddress,
          startingPrice: formData.initialPrice,
          minBidIncrement: formData.minBidIncrement,
          duration: parseInt(formData.auctionDuration) * 3600, // Convert hours to seconds
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create auction');
      }

      toast.success('Auction created successfully!');
      navigate(`/auction/${data.auction.id}`);
    } catch (error) {
      console.error('Error creating auction:', error);
      toast.error(error.message || 'Failed to create auction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create New Auction</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-2">
                  Title
                </label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Enter auction title"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="Describe your NFT"
                  required
                />
              </div>

              <div>
                <label htmlFor="nftAddress" className="block text-sm font-medium mb-2">
                  NFT Contract Address
                </label>
                <Input
                  id="nftAddress"
                  name="nftAddress"
                  value={formData.nftAddress}
                  onChange={handleChange}
                  placeholder="0x..."
                  required
                />
              </div>

              <div>
                <label htmlFor="tokenId" className="block text-sm font-medium mb-2">
                  Token ID
                </label>
                <Input
                  id="tokenId"
                  name="tokenId"
                  value={formData.tokenId}
                  onChange={handleChange}
                  placeholder="Enter token ID"
                  required
                />
              </div>

              <div>
                <label htmlFor="initialPrice" className="block text-sm font-medium mb-2">
                  Initial Price (ETH)
                </label>
                <Input
                  id="initialPrice"
                  name="initialPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.initialPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label htmlFor="minBidIncrement" className="block text-sm font-medium mb-2">
                  Minimum Bid Increment (ETH)
                </label>
                <Input
                  id="minBidIncrement"
                  name="minBidIncrement"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minBidIncrement}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label htmlFor="auctionDuration" className="block text-sm font-medium mb-2">
                  Auction Duration (hours)
                </label>
                <Input
                  id="auctionDuration"
                  name="auctionDuration"
                  type="number"
                  min="1"
                  value={formData.auctionDuration}
                  onChange={handleChange}
                  placeholder="24"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating Auction...' : 'Create Auction'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateAuction; 