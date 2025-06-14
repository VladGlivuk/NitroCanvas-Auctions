export const projectID = process.env.VITE_PUBLIC_WALLET_CONNECT_ID as string;
process.env.VITE_PUBLIC_RPC_DEV
export const rpc = process.env.VITE_PUBLIC_RPC_DEV as string;

import { http } from "wagmi";

import { sepolia } from "wagmi/chains";
import { getDefaultConfig, getDefaultWallets } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export const wagmiConfig = getDefaultConfig({
  appName: "Ddmesh Marketplace App",
  projectId: projectID,
  wallets: [...wallets],
  chains: [sepolia],

  transports: {
    [sepolia.id]: http(rpc, {
      key: "optimism_sepolia",
    }),
  },
});
