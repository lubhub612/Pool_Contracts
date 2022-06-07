import { expect } from "chai";
import { ethers } from "hardhat";
import { ManaPool, ManaPool__factory, Mana, Mana__factory } from "../typechain";
import { BigNumber, Contract, Signer } from "ethers";

describe("ManaPool", function () {
  let admin: Signer;
  let alice: Signer;
  let bob: Signer;
  let provider;

  let adminAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let mana: Mana;
  let xMana: Mana;
  let manaPool: ManaPool;

  const lockTime = 604800; // 7 days (7 * 24 * 60 * 60)
  const fee = 5; // 5 percent
  const FLEXIBLE = "FLEXIBLE";
  const LOCKED = "LOCKED";

  beforeEach(async () => {
    [admin, alice, bob, provider] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
    aliceAddress = await alice.getAddress();
    bobAddress = await bob.getAddress();

    // Deploy Mana Token
    const ManaFactory = (await ethers.getContractFactory(
      "Mana",
      admin
    )) as Mana__factory;
    mana = await ManaFactory.deploy("Mana", "MANA");
    await mana.deployed();

    // Deploy xMana Token
    const xManaFactory = (await ethers.getContractFactory(
      "Mana",
      admin
    )) as Mana__factory;
    xMana = await xManaFactory.deploy("xMana", "xMANA");
    await xMana.deployed();

    // Deploy staking pool ManaPool
    const ManaPoolFactory = (await ethers.getContractFactory(
      "ManaPool",
      admin
    )) as ManaPool__factory;
    manaPool = await ManaPoolFactory.deploy(
      mana.address,
      xMana.address,
      lockTime,
      fee
    );
    manaPool.deployed();

    await mint(
      [adminAddress, aliceAddress, bobAddress, manaPool.address],
      1000
    );
    await xMana._addMinter(manaPool.address); // Set staking pool contract as a minter on xMana

    expect(await balanceOf(adminAddress, mana)).to.equal(toBNValue(1000));
    expect(await balanceOf(aliceAddress, mana)).to.equal(toBNValue(1000));
    expect(await balanceOf(bobAddress, mana)).to.equal(toBNValue(1000));
    expect(await balanceOf(manaPool.address, mana)).to.equal(toBNValue(1000));
    expect(await xMana.isMinter(manaPool.address)).to.equal(true);
  });

  const mint = async (addresses: string[], amount: number) => {
    for (let i = 0; i < addresses.length; i++) {
      await mana.mint(addresses[i], toBNValue(amount));
    }
  };

  const balanceOf = async (
    address: string,
    contract: Contract
  ): Promise<BigNumber> => {
    return await contract.balanceOf(address);
  };

  const approve = async (
    contract: Contract,
    amount: BigNumber,
    spender: string,
    signer: Signer
  ) => {
    await contract.connect(signer).approve(spender, amount);
  };

  const toBNValue = (value: number, scale = 18) => {
    let decimals = BigNumber.from(scale);
    decimals = BigNumber.from(10).pow(decimals);

    return BigNumber.from(value).mul(decimals);
  };

  const calc = (
    amount: BigNumber,
    xManaTotalShares: BigNumber,
    manaPoolAmount: BigNumber
  ): BigNumber => {
    return amount.mul(xManaTotalShares).div(manaPoolAmount);
  };

  const calcReward = async (amount: BigNumber): Promise<BigNumber> => {
    const xManaTotalShares = await xMana.totalSupply();
    const manaPoolAmount = await balanceOf(manaPool.address, mana);

    return amount.mul(manaPoolAmount).div(xManaTotalShares);
  };

  const calcFee = (reward: BigNumber): BigNumber => {
    return reward.mul(fee).div(100);
  };

  const timeTravel = async (t: number) => {
    await provider.provider.send("evm_increaseTime", [t]);
    await provider.provider.send("evm_mine");
  };

  const stake = async (pool: string, amount: BigNumber, signer: Signer) => {
    await approve(mana, amount, manaPool.address, signer);

    switch (pool) {
      case FLEXIBLE:
        await manaPool.connect(signer).stakeInFlexiblePool(amount);
        break;
      case LOCKED:
        await manaPool.connect(signer).stakeInLockedPool(amount);
        break;
    }
  };

  const unStake = async (pool: string, amount: BigNumber, signer: Signer) => {
    await approve(xMana, amount, manaPool.address, signer);

    switch (pool) {
      case FLEXIBLE:
        await manaPool.connect(signer).unstakeFlexiblePool(amount);
        break;
      case LOCKED:
        await manaPool.connect(signer).unstakeFlexiblePool(amount);
        break;
    }
  };

  describe("Stake", () => {
    it("stake in flexible pool", async () => {
      // Stake in flexible pool
      let staker: Signer = alice;
      let stakerAddress = aliceAddress;
      let stakeAmount = toBNValue(100);

      let stakerInitialBalance = await balanceOf(stakerAddress, mana);
      let manaPoolInitialBalance = await balanceOf(manaPool.address, mana);

      await stake(FLEXIBLE, stakeAmount, staker);
      expect(await balanceOf(stakerAddress, xMana)).to.equal(stakeAmount); // Pool is empty so xMana to Mana is 1:1

      expect(await balanceOf(manaPool.address, mana)).to.equal(
        manaPoolInitialBalance.add(stakeAmount)
      );
      expect(await balanceOf(stakerAddress, mana)).to.equal(
        stakerInitialBalance.sub(stakeAmount)
      );

      // Stake in locked pool
      staker = bob;
      stakerAddress = bobAddress;
      stakeAmount = toBNValue(350);
      stakerInitialBalance = await balanceOf(stakerAddress, mana);
      manaPoolInitialBalance = await balanceOf(manaPool.address, mana);

      await stake(LOCKED, stakeAmount, staker);
      const xTokens = calc(
        stakeAmount,
        await xMana.totalSupply(),
        await balanceOf(manaPool.address, mana)
      );

      expect(await balanceOf(stakerAddress, xMana)).to.equal(xTokens);
      expect(await balanceOf(stakerAddress, mana)).to.equal(
        stakerInitialBalance.sub(stakeAmount)
      );
      expect(await balanceOf(manaPool.address, mana)).to.equal(
        manaPoolInitialBalance.add(stakeAmount)
      );
    });
  });

  describe("Unstake", () => {
    it("should unstake from flexible pool", async () => {
      // Stake in flexible pool
      let staker: Signer = alice;
      let stakerAddress = aliceAddress;
      let stakeAmount = toBNValue(100);

      await stake(FLEXIBLE, stakeAmount, staker);

      let stakerInitialxManaBalanceAfterStake = await balanceOf(
        stakerAddress,
        xMana
      );

      let stakerInitialManaBalanceAfterStake = await balanceOf(
        stakerAddress,
        mana
      );

      let xManaTotalsupplyAfterStake = await xMana.totalSupply();

      await timeTravel(259200); // increase time to three days

      let expectedCashout = await calcReward(stakeAmount);
      const stakeInfo = await manaPool.flexiblePool(stakerAddress);

      let [unstakedMana, realReward] = await manaPool.rem(
        expectedCashout,
        stakeAmount,
        stakeInfo.xManaTokens,
        stakeInfo.manaTokens
      );

      const fee = calcFee(realReward);
      realReward = realReward.sub(fee);

      await unStake(FLEXIBLE, stakeAmount, staker);

      let stakerFinalManaBalanceAfterUnstake =
        stakerInitialManaBalanceAfterStake.add(realReward).add(unstakedMana);

      expect(await balanceOf(stakerAddress, xMana)).to.equal(
        stakerInitialxManaBalanceAfterStake.sub(stakeAmount)
      );

      expect(await balanceOf(stakerAddress, mana)).to.equal(
        stakerFinalManaBalanceAfterUnstake
      );

      expect(await xMana.totalSupply()).to.equal(
        xManaTotalsupplyAfterStake.sub(stakeAmount)
      );
    });
  });
});
