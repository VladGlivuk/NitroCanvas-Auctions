import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuctionRequestType } from '@/types/AuctionRequestType';
import {NftMarketplaceABI} from '../../NTFMarketplace';
import { useAccount, useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const CreateAuction: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<AuctionRequestType>({
    title: 'das',
    description: 'ddd',
    contractAddress: '0xe3952E164a6aBe42C06e4235a07F6F56b00F0b99',
    tokenId: '19',
    startingPrice: '1',
    minBidIncrement: '1',
    duration: 24, // Default 24 hours
  });

  const { writeContract } = useWriteContract();
  const { address } = useAccount();
  console.log('address', address);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create auction on blockchain
      writeContract(
        {
          address: '0x57aE8b6D5656a840c2deaA0f8547279daF1A8d0C' as `0x${string}`,
          abi: NftMarketplaceABI,
          functionName: "createAuction",
          args: [
            '0x66601939Ff0374b67c985e08ECFee89677B59cA5' as `0x${string}`,
            BigInt(formData.tokenId),
            1000000000000000000n,
            100000000000000000n,
            604800n
          ],
        },
        {
          onSuccess: async (hash) => {
            console.log("Auction created successfully:", hash);

            // Calculate start and end times
            const startTime = new Date().toISOString();
            const endTime = new Date(Date.now() + formData.duration * 3600 * 1000).toISOString();

            // Create auction in database
            const payload = {
              nftId: formData.tokenId,
              sellerId: address,
              startTime,
              endTime,
              title: formData.title,
              description: formData.description,
              contractAddress: formData.contractAddress,
            };
            console.log('Auction creation payload:', payload);
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auctions/create`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              throw new Error('Failed to create auction in database');
            }

            const auction = await response.json();
            toast.success('Auction created successfully!');
            navigate(`/auction/${auction.id}`);
          },
          onError: (error) => {
            console.error('Error creating auction:', error);
            toast.error('Failed to create auction');
          }
        }
      );
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to create auction');
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
    <div className="max-w-2xl mx-auto space-y-8">
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-3xl">Create New Auction</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-3">
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
                <label htmlFor="description" className="block text-sm font-medium mb-3">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-3 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="Describe your NFT"
                  required
                />
              </div>

              <div>
                <label htmlFor="nftAddress" className="block text-sm font-medium mb-3">
                  NFT Contract Address
                </label>
                <Input
                  id="nftAddress"
                  name="contractAddress"
                  value={formData.contractAddress}
                  onChange={handleChange}
                  placeholder="0x..."
                  required
                />
              </div>

              <div>
                <label htmlFor="tokenId" className="block text-sm font-medium mb-3">
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
                <label htmlFor="initialPrice" className="block text-sm font-medium mb-3">
                  Initial Price (ETH)
                </label>
                <Input
                  id="initialPrice"
                  name="startingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.startingPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label htmlFor="minBidIncrement" className="block text-sm font-medium mb-3">
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
                <label htmlFor="auctionDuration" className="block text-sm font-medium mb-3">
                  Auction Duration (hours)
                </label>
                <Input
                  id="auctionDuration"
                  name="duration"
                  type="number"
                  min="1"
                  value={formData.duration}
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