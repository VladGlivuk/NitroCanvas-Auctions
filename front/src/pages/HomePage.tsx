import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';

interface NFT {
  id: string;
  token_id: string;
  contract_address: string;
  owner_id: string;
  token_uri: string;
  name?: string;
  description?: string;
  created_at: string;
}

interface Auction {
  id: string;
  nft_id: string;
  seller_id: string;
  start_time: string;
  end_time: string;
  status: 'active' | 'completed' | 'cancelled';
  contract_auction_id?: number;
  title: string;
  description?: string;
  highest_bidder?: string;
  highest_bid?: string;
  created_at: string;
  nft?: NFT; // NFT data will be joined from the nfts table
}

const HomePage: React.FC = () => {
  const [imageValidation, setImageValidation] = useState<{ [key: string]: boolean }>({});
  const { address, isConnected } = useAccount();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [nftMetadata, setNftMetadata] = useState<{ [key: string]: any }>({});
  const navigate = useNavigate();
  const auctionsPerPage = 10;

  useEffect(() => {
    fetchAuctions(currentPage);
    const interval = setInterval(() => fetchAuctions(currentPage), 30000);
    return () => clearInterval(interval);
  }, [currentPage]);

  // Function to fetch NFT metadata from token_uri
  const fetchNFTMetadata = async (tokenUri: string): Promise<any> => {
    try {
      // Handle IPFS URLs
      let metadataUrl = tokenUri;
      if (tokenUri.startsWith('ipfs://')) {
        metadataUrl = tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }
      
      const metadata = await response.json();
      return metadata;
    } catch (error) {
      console.error('Error fetching NFT metadata:', error);
      return null;
    }
  };

  // Function to validate if a URL is a valid image
  const validateImageUrl = async (url: string): Promise<boolean> => {
    if (!url) return false;
    
    try {
      // Handle IPFS URLs
      let imageUrl = url;
      if (url.startsWith('ipfs://')) {
        imageUrl = url.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      // Check if URL has image extension
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
      const hasImageExtension = imageExtensions.some(ext => 
        imageUrl.toLowerCase().includes(ext)
      );
      
      if (hasImageExtension) {
        // Try to load the image to verify it's actually an image
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = imageUrl;
          
          // Timeout after 5 seconds
          setTimeout(() => resolve(false), 5000);
        });
      }
      
      // For URLs without clear image extensions, try to fetch and check content-type
      const response = await fetch(imageUrl, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      return contentType?.startsWith('image/') || false;
    } catch (error) {
      console.error('Error validating image URL:', error);
      return false;
    }
  };

  // Function to extract image URL from NFT metadata
  const extractImageUrl = (auction: Auction): string | null => {
    if (!auction.nft?.token_uri) return null;
    
    const metadata = nftMetadata[auction.nft.id];
    if (!metadata) return null;
    
    // Common metadata fields for images in NFT standards (ERC-721, ERC-1155)
    const imageFields = ['image', 'image_url', 'image_data', 'animation_url'];
    for (const field of imageFields) {
      if (metadata[field]) {
        return metadata[field];
      }
    }
    
    return null;
  };

  // Fetch and validate NFT metadata and images
  const processNFTData = async (auctions: Auction[]) => {
    const metadataPromises = auctions
      .filter(auction => auction.nft?.token_uri)
      .map(async (auction) => {
        const metadata = await fetchNFTMetadata(auction.nft!.token_uri);
        return { nftId: auction.nft!.id, metadata };
      });

    const metadataResults = await Promise.all(metadataPromises);
    const metadataMap: { [key: string]: any } = {};
    
    metadataResults.forEach(({ nftId, metadata }) => {
      metadataMap[nftId] = metadata;
    });
    
    setNftMetadata(metadataMap);

    // Now validate images based on the fetched metadata
    const validationPromises = auctions.map(async (auction) => {
      if (!auction.nft) return { auctionId: auction.id, isValid: false };
      
      const metadata = metadataMap[auction.nft.id];
      if (!metadata) return { auctionId: auction.id, isValid: false };
      
      const imageUrl = extractImageUrlFromMetadata(metadata);
      if (imageUrl) {
        const isValid = await validateImageUrl(imageUrl);
        return { auctionId: auction.id, isValid };
      }
      return { auctionId: auction.id, isValid: false };
    });

    const validationResults = await Promise.all(validationPromises);
    const validationMap: { [key: string]: boolean } = {};
    
    validationResults.forEach(({ auctionId, isValid }) => {
      validationMap[auctionId] = isValid;
    });
    
    setImageValidation(validationMap);
  };

  // Helper function to extract image URL from metadata
  const extractImageUrlFromMetadata = (metadata: any): string | null => {
    if (!metadata) return null;
    
    const imageFields = ['image', 'image_url', 'image_data', 'animation_url'];
    for (const field of imageFields) {
      if (metadata[field]) {
        return metadata[field];
      }
    }
    return null;
  };

  const fetchAuctions = async (page: number) => {
    setIsLoading(true);
    try {
      console.log('Fetching auctions for page:', page);
      const url = new URL(`${import.meta.env.VITE_API_URL}/api/auctions`);
      url.searchParams.append('page', page.toString());
      url.searchParams.append('limit', auctionsPerPage.toString());
      if (address) {
        url.searchParams.append('sellerId', address.toLowerCase());
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          // 'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      console.log('Received auction data:', data);
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch auctions');
      }
      
      if (!data.auctions || !Array.isArray(data.auctions)) {
        console.error('Invalid auction data received:', data);
        throw new Error('Invalid auction data received from server');
      }
      
      setAuctions(data.auctions);
      setTotalPages(data.totalPages);
      
      // Process NFT metadata and validate images after setting auctions
      await processNFTData(data.auctions);
      
      console.log('Updated auctions state:', data.auctions);
    } catch (error: unknown) {
      console.error('Error fetching auctions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch auctions';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const getTimeLeft = (endTimeString: string) => {
    const end = new Date(endTimeString).getTime();
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

  const goToAuctionPage = (auction: Auction) => {
    navigate(`/auction/${auction.id}`);
  }

  // Component for rendering NFT image or placeholder
  const NFTImage: React.FC<{ auction: Auction }> = ({ auction }) => {
    if (!auction.nft) return null;

    const metadata = nftMetadata[auction.nft.id];
    const imageUrl = metadata ? extractImageUrlFromMetadata(metadata) : null;
    const isValidImage = imageValidation[auction.id];
    
    // Only render if it's a valid image
    if (isValidImage && imageUrl) {
      let processedImageUrl = imageUrl;
      if (imageUrl.startsWith('ipfs://')) {
        processedImageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      return (
        <div className="aspect-square relative mb-3">
          <img
            src={processedImageUrl}
            alt={auction.nft.name || auction.title}
            className="object-cover w-full h-full rounded-md"
            onError={(e) => {
              // Hide the entire image container if image fails to load
              const container = e.currentTarget.parentElement;
              if (container) {
                container.style.display = 'none';
              }
            }}
          />
        </div>
      );
    }
    
    // Return null for non-image NFTs (don't show anything)
    return null;
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Active Auctions</h1>
        <Link to="/create-auction">
          <Button>Create Auction</Button>
        </Link>
      </div>
      {auctions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground mb-4">No active auctions found</p>
          <Link to="/create-auction" className="inline-block">
            <Button>Create Your First Auction</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {auctions.map((auction) => {
            const isSeller = address?.toLowerCase() === auction.seller_id.toLowerCase();
            const canJoinAuction = !isSeller && auction.status === 'active';

            return (
              <Card key={auction.id} className="overflow-hidden h-fit cursor-pointer" onClick={() => goToAuctionPage(auction)}>
                <NFTImage auction={auction} />
                <CardHeader className="p-3">
                  <CardTitle className="text-sm font-semibold truncate">{auction.title}</CardTitle>
                  {auction.description && (
                    <CardDescription className="text-xs line-clamp-2">{auction.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Price</p>
                      <p className="text-sm font-bold">
                        {auction.highest_bid ? formatEther(BigInt(auction.highest_bid)) : 'N/A'} ETH
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Time Left</p>
                      <p className="text-sm font-bold">
                        {getTimeLeft(auction.end_time)}
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-3 pt-0">
                  {canJoinAuction ? (
                    <Link to={`/auction/${auction.id}`} className="w-full">
                      <Button className="w-full text-xs py-2">Join Auction</Button>
                    </Link>
                  ) : (
                    <Button className="w-full text-xs py-2" disabled>
                      {isSeller ? 'Your Auction' : `Auction ${auction.status}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-4 mt-6">
          <Button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>Page {currentPage} of {totalPages}</span>
          <Button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default HomePage;