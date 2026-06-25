# On-Chain Verification

## Smart Contract

| Category | Detail |
|---|---|
| Contract Address | `0x6034F9Cc959ea5F49Be2ac133382AFE6Ef5d6AB0` |
| Solidity Version | ^0.8.20 |
| Development Tool | Remix IDE website v2.2.0 |
| Network | Sepolia Testnet (Chain ID: 11155111) |
| Etherscan | https://sepolia.etherscan.io/address/0x6034F9Cc959ea5F49Be2ac133382AFE6Ef5d6AB0 |

---

## dApps Technical Stack

| Category | Detail |
|---|---|
| Library | Ethers.js v6.7.0 |
| Wallet Connector | MetaMask Chrome Extension |
| Simulation Script | Node.js + RPC Endpoint |
| Output File | results.csv |

---

## Account Configuration

| Account | Role |
|---|---|
| Account 1 | Budget Officer + ICV (role=2) + GAN (deployer) |
| Account 2 | BAV (role=1) |
| Role Assignment | registerOfficer() + registerValidator() via Remix IDE |

---

## End-to-End Proof of Concept Transaction

| Parameter | Detail |
|---|---|
| Transaction Hash (REALIZED) | `0xd724821086c7cb4151a64731cb50a299c55891d9614dcd871681fe866e96510b` |
| Transaction Hash (VALIDATED) | `0xcb75c6bbaac317fc8aa134c2ecfcd728cbc9b84086188dba7e91c59c4be22012` |
| Anchor ID | `0x9fec3f93fa9705b90d89713fa874cbdc5bac63eea91a9c98e6e95965693fe97a` |
| Anchor ID Source | Transaction receipt logs via topics[1] |
| Sector | DEF |
| Transaction Value | 1 ETH |

### Lifecycle Block Progression

| Status | Block | Timestamp |
|---|---|---|
| PENDING | 10833810 | 5/11/2026 11:21:24 PM |
| VALIDATED | 10833846 | — |
| REALIZED | 10833861 | 5/11/2026 11:34:24 PM |

---

## Simulation Verification

All 2,400 on-chain transactions generated during the 600-cycle simulation
are independently and publicly verifiable via Sepolia Etherscan at the
contract address above without administrative mediation.
