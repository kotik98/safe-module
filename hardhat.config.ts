import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
require("dotenv").config();

const { ALCHEMY_POLYGON, WALLET_SECRET1 } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  defaultNetwork: "matic",
  networks: {
    hardhat: {
    },
    matic: {
      url: ALCHEMY_POLYGON,
      accounts: [`0x${WALLET_SECRET1}`]
    }
  },
  etherscan: {
    apiKey: 'https://polygonscan.com/'
  },
};

export default config;
