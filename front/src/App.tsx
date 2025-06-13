import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AuctionTradePage from './pages/AuctionTradePage';
import CreateAuction from './pages/CreateAuction';
import Layout from './shared/components/layout/Layout';
import { Web3ContextProvider } from './shared/contexts/Web3Context';

function App() {
  return (
    <Web3ContextProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auction/:auctionId" element={<AuctionTradePage />} />
            <Route path="/create-auction" element={<CreateAuction />} />
          </Routes>
        </Layout>
      </Router>
    </Web3ContextProvider>
  );
}

export default App;
