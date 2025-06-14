import { http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getDefaultConfig, getDefaultWallets } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export const wagmiConfig = getDefaultConfig({
  appName: "Ddmesh Marketplace App",
  projectId: '8036f50b97d23217a601bdc1180c4931',
  wallets: [...wallets],
  chains: [sepolia],
  transports: {
    [sepolia.id]: http('https://sepolia.infura.io/v3/7644e7d5aff5411e9621a7a83479577e', {
      key: "sepolia",
    }),
  },
});
