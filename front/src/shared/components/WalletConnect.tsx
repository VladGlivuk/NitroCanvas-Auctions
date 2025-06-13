import React from 'react';
import { Button } from './ui/button';
import { useWeb3 } from '../contexts/Web3Context';

const WalletConnect: React.FC = () => {
  const { account, isConnecting, isConnected, connect, disconnect } = useWeb3();

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
          <span className="text-sm font-medium">{account}</span>
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