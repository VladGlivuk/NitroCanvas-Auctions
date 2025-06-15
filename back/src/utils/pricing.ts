import { ethers } from 'ethers';

/**
 * Utility functions for converting between USD and ETH amounts
 * for auction pricing
 */

// Cache ETH price for a few minutes to avoid excessive API calls
let cachedEthPrice: number | null = null;
let priceLastUpdated: number = 0;
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current ETH price from a free API
 */
async function fetchEthPrice(): Promise<number> {
  try {
    // Using CoinGecko's free API (no API key required)
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return data.ethereum.usd;
  } catch (error) {
    console.warn('Failed to fetch ETH price, using fallback price:', error);
    return 3300; // Fallback price in USD
  }
}

/**
 * Get current ETH price with caching
 */
export async function getEthPriceUSD(): Promise<number> {
  const now = Date.now();
  
  if (cachedEthPrice && (now - priceLastUpdated) < PRICE_CACHE_DURATION) {
    return cachedEthPrice;
  }
  
  cachedEthPrice = await fetchEthPrice();
  priceLastUpdated = now;
  
  console.log(`ETH price updated: $${cachedEthPrice} USD`);
  return cachedEthPrice;
}

/**
 * Convert USD amount to ETH (returns as string in ETH units)
 */
export async function usdToEth(usdAmount: number): Promise<string> {
  const ethPrice = await getEthPriceUSD();
  const ethAmount = usdAmount / ethPrice;
  return ethAmount.toFixed(6); // Return with 6 decimal places
}

/**
 * Convert USD amount to Wei (returns as string in Wei units)
 */
export async function usdToWei(usdAmount: number): Promise<string> {
  const ethAmount = await usdToEth(usdAmount);
  return ethers.parseEther(ethAmount).toString();
}

/**
 * Convert ETH amount to USD
 */
export async function ethToUsd(ethAmount: string): Promise<number> {
  const ethPrice = await getEthPriceUSD();
  const ethValue = parseFloat(ethAmount);
  return ethValue * ethPrice;
}

/**
 * Convert Wei amount to USD
 */
export async function weiToUsd(weiAmount: string): Promise<number> {
  const ethAmount = ethers.formatEther(weiAmount);
  return ethToUsd(ethAmount);
}

/**
 * Get default auction pricing in USD equivalents
 */
export const DEFAULT_AUCTION_PRICING = {
  MINIMUM_BID_USD: 1.0,        // $1 USD minimum bid
  MIN_INCREMENT_USD: 0.25,     // $0.25 USD minimum increment
  SUGGESTED_START_USD: 5.0     // $5 USD suggested starting price
};

/**
 * Generate auction pricing in Wei based on USD amounts
 */
export async function generateAuctionPricing(options?: {
  minimumBidUsd?: number;
  minIncrementUsd?: number;
}) {
  const minimumBidUsd = options?.minimumBidUsd || DEFAULT_AUCTION_PRICING.MINIMUM_BID_USD;
  const minIncrementUsd = options?.minIncrementUsd || DEFAULT_AUCTION_PRICING.MIN_INCREMENT_USD;
  
  const [startingPriceWei, minIncrementWei] = await Promise.all([
    usdToWei(minimumBidUsd),
    usdToWei(minIncrementUsd)
  ]);
  
  const ethPrice = await getEthPriceUSD();
  
  return {
    startingPriceWei,
    minIncrementWei,
    startingPriceEth: await usdToEth(minimumBidUsd),
    minIncrementEth: await usdToEth(minIncrementUsd),
    ethPriceUsd: ethPrice,
    minimumBidUsd,
    minIncrementUsd
  };
}