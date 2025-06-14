import hardhat from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Deploying NFTMarketplace contract...");

  // Get the contract factory
  const NFTMarketplace = await hardhat.ethers.getContractFactory("NFTMarketplace");
  
  // Deploy the contract
  const nftMarketplace = await NFTMarketplace.deploy();
  
  // Wait for deployment to finish
  await nftMarketplace.waitForDeployment();
  
  const contractAddress = await nftMarketplace.getAddress();
  console.log("NFTMarketplace deployed to:", contractAddress);

  // Update .env file with the new contract address
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";
  
  try {
    envContent = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    console.log("No existing .env file found, creating new one");
  }

  // Update or add CONTRACT_ADDRESS
  if (envContent.includes("CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${contractAddress}`
    );
  } else {
    envContent += `\nCONTRACT_ADDRESS=${contractAddress}`;
  }

  // Write back to .env file
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env file with new contract address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 