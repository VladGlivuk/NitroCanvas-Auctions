import { useState } from 'react';
import { useContractWrite, useWaitForTransaction } from 'wagmi';
import { useAccount } from 'wagmi';
import { NFTMarketplaceABI } from '../contracts/NFTMarketplaceABI';
import { NFTMarketplaceAddress } from '../contracts/NFTMarketplaceAddress';
import { CreateAuctionRequest } from '../types/auction';
import { parseEther } from 'viem';

export default function CreateAuction() {
  const { address } = useAccount();
  const [formData, setFormData] = useState<CreateAuctionRequest>({
    nftId: '',
    sellerId: address || '',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Default 24 hours
    title: '',
    description: '',
  });
  const [startingPrice, setStartingPrice] = useState('');
  const [minBidIncrement, setMinBidIncrement] = useState('');
  const [duration, setDuration] = useState('86400'); // 24 hours in seconds

  // Create auction on blockchain
  const { write: createAuction, data: createAuctionData } = useContractWrite({
    address: NFTMarketplaceAddress,
    abi: NFTMarketplaceABI,
    functionName: 'createAuction',
  });

  const { isLoading: isCreatingAuction } = useWaitForTransaction({
    hash: createAuctionData?.hash,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      // Create auction on blockchain
      createAuction({
        args: [
          formData.nftId,
          parseEther(startingPrice),
          parseEther(minBidIncrement),
          BigInt(duration)
        ],
      });

      // After successful blockchain transaction, create auction in database
      const response = await fetch('/api/auctions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          sellerId: address,
          contractAuctionId: Date.now(), // This will be replaced with actual contract auction ID
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create auction');
      }

      const auction = await response.json();
      window.location.href = `/auction/${auction.id}`;
    } catch (error) {
      console.error('Error creating auction:', error);
      alert('Failed to create auction');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create New Auction</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">NFT ID</label>
          <input
            type="text"
            value={formData.nftId}
            onChange={(e) => setFormData({ ...formData, nftId: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            rows={4}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Starting Price (ETH)</label>
          <input
            type="number"
            step="0.001"
            value={startingPrice}
            onChange={(e) => setStartingPrice(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Minimum Bid Increment (ETH)</label>
          <input
            type="number"
            step="0.001"
            value={minBidIncrement}
            onChange={(e) => setMinBidIncrement(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Duration (seconds)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isCreatingAuction}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isCreatingAuction ? 'Creating Auction...' : 'Create Auction'}
        </button>
      </form>
    </div>
  );
} 