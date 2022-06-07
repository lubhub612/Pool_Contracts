// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const ManaToken = await deployToken("Mana", "MANA");
  console.log("ManaToken deployed to:", ManaToken.address);

  const xManaToken = await deployToken("xMana", "xMANA");
  console.log("xManaToken deployed to:", xManaToken.address);

  const ManaPool = await ethers.getContractFactory("ManaPool");
  const manaPool = await ManaPool.deploy(ManaToken.address, xManaToken.address, 7*24*60*60, 5);
  await manaPool.deployed()
  console.log("ManaPool deployed to:", manaPool.address);

  await xManaToken._addMinter(manaPool.address);
  console.log(`Added ${manaPool.address} as minter to xMana`);

  await ManaToken._addMinter(manaPool.address);
  console.log(`Added ${manaPool.address} as minter to Mana`);
}

const deployToken = async (name: string, symbol: string) => {
  const ManaToken = await ethers.getContractFactory("Mana");
  const manaToken = await ManaToken.deploy(name, symbol);
  await manaToken.deployed();
  return manaToken
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
