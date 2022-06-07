//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./ManaERC20.sol";

import "hardhat/console.sol";

contract ManaPool is Ownable{
  using SafeMath for uint256;

  uint256 public lockTime;
  uint256 public fee;
  Mana public mana;
  Mana public xMana;
  uint256 public availableRewards;
  uint256 public totalStaked;

  enum PoolType{ FLEXIBLE, LOCKED }

  struct StakeInfo {
    uint256 manaTokens;
    uint256 xManaTokens;
    uint256 stakedTime;
    }

    mapping(address => StakeInfo) public flexiblePool;
    mapping(address => uint256) public rewardsEarned;
    mapping(address => StakeInfo) public lockedPool;

    event FlexibleStake(uint256 indexed stakeAmount, address indexed staker);

    event LockedStake(uint256 indexed stakeAmount, address indexed staker);

    event NewFee(uint256 indexed oldFee, uint256 indexed newFee);

    event NewLockTime(uint256 indexed oldLockTime, uint256 indexed newLockTime);

  modifier checkAllowance(uint256 _stakeAmount, IERC20 _ierc20) {
    require(_ierc20.allowance(msg.sender, address(this)) >= _stakeAmount, "ManaPool: insufficinet allowance");
    _;
  }

  modifier checkBalance(uint256 _stakeAmount) {
    require(mana.balanceOf(msg.sender) >= _stakeAmount, "ManaPool: insufficinet mana");
    _;
  }

  constructor(Mana _mana, Mana _xMana, uint256 _lockTime, uint256 _fee) {
    lockTime = _lockTime;
    fee = _fee;
    mana = _mana;
    xMana = _xMana;
  }

  function stakeInFlexiblePool(uint256 _stakeAmount) external checkAllowance(_stakeAmount, mana) checkBalance(_stakeAmount){
    _stake(_stakeAmount, msg.sender, PoolType.FLEXIBLE);

    emit FlexibleStake(_stakeAmount, msg.sender);
  }

  function stakeInLockedPool(uint256 _stakeAmount) external checkAllowance(_stakeAmount, mana) checkBalance(_stakeAmount) {
    _stake(_stakeAmount, msg.sender, PoolType.LOCKED);

    emit LockedStake(_stakeAmount, msg.sender);
  }

  function _stake(uint256 _stakeAmount, address _staker, PoolType _poolType) internal {
    uint256 xManaSupply = xMana.totalSupply();
    uint256 totalMana = mana.balanceOf(address(this));

    uint256 xManaTokens;
    if (xManaSupply == 0 || totalMana == 0) {
      xMana.mint(_staker, _stakeAmount);
      xManaTokens = _stakeAmount;
    } else {
      uint256 xAmount = _stakeAmount.mul(xManaSupply).div(totalMana);
      xMana.mint(_staker, xAmount);
      xManaTokens = xAmount;
    }

    if (_poolType == PoolType.FLEXIBLE) {
      uint256 currentManaTokens = flexiblePool[msg.sender].manaTokens;
      uint256 currentxManaTokens = flexiblePool[msg.sender].xManaTokens;

      uint256 newManaTokens = currentManaTokens.add(_stakeAmount);
      uint256 newxManaTokens = currentxManaTokens.add(xManaTokens);

      StakeInfo memory _stakeInfo = StakeInfo(newManaTokens, newxManaTokens, _getNow());
      flexiblePool[_staker] = _stakeInfo;
    } else {
      uint256 currentManaTokens = lockedPool[msg.sender].manaTokens;
      uint256 currentxManaTokens = lockedPool[msg.sender].xManaTokens;

      uint256 newManaTokens = currentManaTokens.add(_stakeAmount);
      uint256 newxManaTokens = currentxManaTokens.add(xManaTokens);

      StakeInfo memory _stakeInfo = StakeInfo(newManaTokens, newxManaTokens, _getNow());
      lockedPool[_staker] = _stakeInfo;
    }


     // Lock the Mana in the contract
    mana.transferFrom(_staker, address(this), _stakeAmount);
    totalStaked = totalStaked.add(_stakeAmount);
  }

  function unstakeFlexiblePool(uint256 _amount) external checkAllowance(_amount, xMana){
    StakeInfo memory _stakeInfo = flexiblePool[msg.sender];
    uint256 unStakedMana = _unstake(_amount, msg.sender, _stakeInfo.stakedTime, PoolType.FLEXIBLE, _stakeInfo);

    _stakeInfo = StakeInfo(_stakeInfo.manaTokens.sub(unStakedMana), _stakeInfo.xManaTokens.sub(_amount), _getNow());

    flexiblePool[msg.sender] = _stakeInfo;
  }

  function unstakeLockedPool(uint256 _amount) external checkAllowance(_amount, xMana){
    StakeInfo memory _stakeInfo = lockedPool[msg.sender];
    require(_fullClaim(_stakeInfo.stakedTime), "Mana: not yet time");

    uint256 unStakedMana = _unstake(_amount, msg.sender, _stakeInfo.stakedTime, PoolType.LOCKED, _stakeInfo);
    
    _stakeInfo = StakeInfo(_stakeInfo.manaTokens.sub(unStakedMana), _stakeInfo.xManaTokens.sub(_amount), _getNow());

    lockedPool[msg.sender] = _stakeInfo;
  }

  function _unstake(uint256 _amount, address _account, uint256 _stakedTime, PoolType _poolType, StakeInfo memory _stakeInfo) internal returns (uint256){
    require(_stakeInfo.xManaTokens >= _amount, "ManaPool: incorrect xMana");
    require(_stakeInfo.manaTokens > 0, "ManaPool: no stake");
    require(xMana.balanceOf(msg.sender) >= _amount, "ManaPool: insufficinet xMana");

    uint256 unStakedMana;
    uint256 realReward;

    uint256 reward = calculateReward(_amount); //_amount.mul(totalMana).div(xManaTotalSupply)
    (unStakedMana, realReward) = rem(reward, _amount, _stakeInfo.xManaTokens, _stakeInfo.manaTokens);

    if (PoolType.FLEXIBLE == _poolType && !_fullClaim(_stakedTime)) {
      uint256 fee = realReward.mul(fee).div(100);
      reward = reward.sub(fee); // 
    } 

    xMana.burn(msg.sender, _amount);
    mana.transfer(msg.sender, reward);
    totalStaked = totalStaked.sub(unStakedMana);
    rewardsEarned[msg.sender] = rewardsEarned[msg.sender].add(reward);

    return unStakedMana;
  }

  function _getNow() internal view virtual returns (uint256) {
      return block.timestamp;
  }

  function _fullClaim(uint256 _stakeTime) internal returns (bool) {
    if (_stakeTime + lockTime >= _getNow()) return false;

    return true;
  }

  function canUnstake() public view returns (bool) {
    if (lockedPool[msg.sender].stakedTime + lockTime >= _getNow()) return false;

    return true;
  }

  function _setFee(uint256 _newFee) external onlyOwner {
    uint256 oldFee = fee;
    fee = _newFee;

    emit NewFee(oldFee, _newFee);
  }

  function _setLockTime(uint256 _newLockTime) external onlyOwner {
    uint256 oldLockTime = lockTime;
    lockTime = _newLockTime;

    emit NewLockTime(oldLockTime, _newLockTime);
  }

  function calculateReward(uint256 _amount) public view returns (uint256) {
    uint256 xManaTotalSupply = xMana.totalSupply();
    uint256 totalMana = mana.balanceOf(address(this));

    return _amount.mul(totalMana).div(xManaTotalSupply);
  }

  function rem(uint256 _realCashoutAmount, uint256 _xUnstakeAmount, uint256 _xStake, uint256 _stakedMana) public view returns (uint256, uint256) {
    uint256 fullCashoutAmount = calculateReward(_xStake);
    uint256 fullReward = fullCashoutAmount.sub(_stakedMana);

    uint256 actualRewardPercent = _xUnstakeAmount.mul(100).div(_xStake);
    uint256 realReward = actualRewardPercent.mul(fullReward).div(100);
    uint256 unstakedMana = _realCashoutAmount.sub(realReward);
    return (unstakedMana, realReward);
  }

  function addReward(uint256 _reward) external onlyOwner {
    mana.mint(address(this), _reward);
    availableRewards = availableRewards.add(_reward);
  }
}