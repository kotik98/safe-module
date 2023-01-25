import hre from "hardhat"

async function main() {
  const WhitelistingModule = await hre.ethers.getContractFactory("WhitelistingModuleV2");
  const module = await WhitelistingModule.deploy('0xd317963bAA33957C1675a8aDED7b1C0273be90DB'); 
  await module.deployed();  
  console.log("Module deployed to address: ", module.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run .\scripts\deploy.ts