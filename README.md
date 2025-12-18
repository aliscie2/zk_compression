# ZK Compression on Solana

Rent-free compressed accounts using Light Protocol.

## Requirements

- Solana CLI 2.3.11 (3.x not supported yet)
- Anchor 0.31.1
- Node.js 23.x+
- @lightprotocol/zk-compression-cli 0.27.1-alpha.2

## Setup

```bash
# Solana CLI (must be 2.3.11)
sh -c "$(curl -sSfL https://release.anza.xyz/v2.3.11/install)"

# Anchor 0.31.1
avm install 0.31.1

# Light CLI
npm i -g @lightprotocol/zk-compression-cli@0.27.1-alpha.2

# Generate keypair
solana-keygen new

# Install deps & build
npm install
anchor build
```

> `[toolchain]` in `Anchor.toml` auto-selects Anchor 0.31.1 for this project.

## Test

```bash
# Terminal 1
light test-validator

# Terminal 2
anchor test --skip-local-validator
```

Or run both with: `npm test`

## Instructions

- `create` - Create a compressed account (rent-free)
- `update` - Update account data
- `delete` - Delete account

## Links

- [Light Protocol Docs](https://www.zkcompression.com/)
