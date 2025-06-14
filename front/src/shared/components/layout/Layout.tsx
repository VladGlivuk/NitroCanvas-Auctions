import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import WalletConnect from '../WalletConnect';
import { useWeb3 } from '@/shared/contexts/Web3Context';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isConnected } = useWeb3();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/">
                <Button 
                  variant={location.pathname === '/' ? "default" : "outline"}
                  className={location.pathname === '/' ? "bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white" : "text-white"}
                >
                  NFT Auctions
                </Button>
              </Link>
              <Link to="/create-auction" className="ml-0.5">
                <Button 
                  variant={location.pathname === '/create-auction' ? "default" : "outline"}
                  className={location.pathname === '/create-auction' ? "bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white" : "text-white"}
                >
                  Create Auction
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <WalletConnect />
            </div>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-muted-foreground">
            © 2025 NFT Auctions. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout; 