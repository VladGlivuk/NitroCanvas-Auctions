import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import WalletConnect from '../WalletConnect';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold text-primary">
              NFT Auctions
            </Link>
            <div className="flex items-center gap-4">
              <WalletConnect />
              <Link to="/create-auction">
                <Button variant="default">Create Auction</Button>
              </Link>
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
            © 2024 NFT Auctions. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout; 