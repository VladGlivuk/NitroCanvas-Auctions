import React, { useState } from 'react';
import { Button } from './ui/button';
import { useWeb3 } from '../contexts/Web3Context';

const WalletConnect: React.FC = () => {
  const { account, isConnecting, isConnected, connect, disconnect } = useWeb3();
  const [showFullAddress, setShowFullAddress] = useState(false);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return showFullAddress ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopy = () => {
    if (account) {
      navigator.clipboard.writeText(account).then(() => {
        alert('Address copied to clipboard!');
        setShowFullAddress(false); // Hide full address after copy
      }).catch(err => {
        console.error('Failed to copy address:', err);
        alert('Failed to copy address');
      });
    }
  };

  return (
    <div>
      {!isConnected ? (
        <Button
          onClick={connect}
          disabled={isConnecting}
          variant="default"
        >
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
      ) : (
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-medium cursor-pointer text-blue-500 hover:underline"
            onClick={() => setShowFullAddress(!showFullAddress)}
            onDoubleClick={handleCopy}
          >
            {formatAddress(account || '')}
          </span>
          <Button
            onClick={disconnect}
            variant="outline"
            size="sm"
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;