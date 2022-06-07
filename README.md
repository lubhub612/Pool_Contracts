## Mana

Mana smart contracts implements a staking pool and an ERC-20 token. This package uses the hardhat framework for contract development and deployment.
Reference implementations for contracts has been deployed on the BSC testnet

### ManaPool
The ManaPool contract defines the staking pool; it supports a flexible and locked pool. Reward mechanics was inspired from [aurory-staking](https://auroryproject.medium.com/aurory-staking-d417dfdc32b5) and [locked-flexible-aury-staking](https://auroryproject.medium.com/locked-flexible-aury-staking-30b7bacf1a1c).

### Mana
The Mana token is a standard implementation of ERC20

# Deployments
- ManaPool: 0xfbcA791a91D44Ab43bdfEdC7B20E27FE98D6514b
- Mana Token: 0x7d2a09FFd4f2AB394d7Fe7e94e0E932d583e6164
- xMana: 0x49FeD146c3372A66D1218c221A50Adf929711dD5

### Build
While in contracts directory, run: `npm install`. To run test, `npx hardhat test`


### TODOS
- [] Add tests; increasing code coverage to 100%
