import hre from "hardhat"
require("dotenv").config();

const { SAFE_ADDRESS } = process.env;

async function main() {
  const WhitelistingModule = await hre.ethers.getContractFactory("WhitelistingModuleV2");
  if (SAFE_ADDRESS){
    const module = await WhitelistingModule.deploy(SAFE_ADDRESS); 
    await module.deployed();  
    console.log("Module deployed to address: ", module.address);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run .\scripts\deploy.ts