import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

const CreateAuction: React.FC = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    nftAddress: '',
    tokenId: '',
    initialPrice: '',
    minBidIncrement: '',
    auctionDuration: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log('Form submitted:', formData);
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
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
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

            <Button type="submit" className="w-full">
              Create Auction
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateAuction; 