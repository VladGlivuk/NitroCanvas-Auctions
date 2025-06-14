import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AuctionTradePage from './pages/AuctionTradePage';
import CreateAuction from './pages/CreateAuction';
import Layout from './shared/components/layout/Layout';
import { Toaster } from './components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../wagmi.config';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
    <RainbowKitProvider>
    {/* <Web3ContextProvider> */}
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auction/:auctionId" element={<AuctionTradePage />} />
            <Route path="/create-auction" element={<CreateAuction />} />
          </Routes>
        </Layout>
        <Toaster />
      </Router>
      </RainbowKitProvider>
    {/* </Web3ContextProvider> */}
      </QueryClientProvider>
  </WagmiProvider>
  );
}



export default App;
