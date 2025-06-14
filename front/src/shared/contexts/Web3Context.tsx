import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  provider: ethers.providers.Web3Provider | null;
}

const Web3Context = createContext<Web3ContextType>({
  account: null,
  chainId: null,
  isConnecting: false,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
  provider: null,
});

export const useWeb3 = () => useContext(Web3Context);

export const Web3ContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const connectionLock = useRef(false);

  const connect = async () => {
    if (connectionLock.current || isConnecting) return;

    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask to use this feature');
      return;
    }

    try {
      connectionLock.current = true;
      setIsConnecting(true);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const message = `Login to NitroCanvas with ${address}`;
      const signature = await signer.signMessage(message);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, signature, message }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setAccount(address);
        setChainId((await provider.getNetwork()).chainId);
        setProvider(provider);
        setIsConnected(true);
      } else {
        throw new Error(data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Error connecting to MetaMask:', error);
      alert(`Failed to connect to MetaMask or login: ${error.message}`);
    } finally {
      setIsConnecting(false);
      connectionLock.current = false;
    }
  };

  const disconnect = () => {
    localStorage.removeItem('token');
    setAccount(null);
    setChainId(null);
    setProvider(null);
    setIsConnected(false);
  };

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0]);
      }
    };

    const handleChainChanged = (chainId: string) => {
      setChainId(parseInt(chainId, 16));
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Web3Context.Provider
      value={{
        account: account ? formatAddress(account) : null,
        chainId,
        isConnecting,
        isConnected,
        connect,
        disconnect,
        provider,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};