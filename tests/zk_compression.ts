import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { ZkCompression } from "../target/types/zk_compression";
import {
  bn,
  CompressedAccountWithMerkleContext,
  confirmTx,
  createRpc,
  defaultTestStateTreeAccounts,
  deriveAddress,
  deriveAddressSeed,
  LightSystemProgram,
  PackedAccounts,
  Rpc,
  sleep,
  SystemAccountMetaConfig,
} from "@lightprotocol/stateless.js";
import { assert } from "chai";

const path = require("path");
const os = require("os");
require("dotenv").config();

const anchorWalletPath = path.join(os.homedir(), ".config/solana/id.json");
process.env.ANCHOR_WALLET = anchorWalletPath;

describe("zk-compression", () => {
  const program = anchor.workspace.ZkCompression as Program<ZkCompression>;
  const coder = new anchor.BorshCoder(program.idl as anchor.Idl);

  it("creates, updates, and deletes a compressed account", async () => {
    const signer = new web3.Keypair();
    const rpc = createRpc(
      "http://127.0.0.1:8899",
      "http://127.0.0.1:8784",
      "http://127.0.0.1:3001",
      { commitment: "confirmed" }
    );

    // Airdrop SOL
    await rpc.requestAirdrop(signer.publicKey, web3.LAMPORTS_PER_SOL);
    await sleep(2000);

    const outputMerkleTree = defaultTestStateTreeAccounts().merkleTree;
    const addressTree = defaultTestStateTreeAccounts().addressTree;
    const addressQueue = defaultTestStateTreeAccounts().addressQueue;

    // Derive address
    const seed = deriveAddressSeed(
      [new TextEncoder().encode("compressed_data"), signer.publicKey.toBytes()],
      new web3.PublicKey(program.programId)
    );
    const address = deriveAddress(seed, addressTree);

    // Create compressed account
    await createCompressedAccount(
      rpc,
      addressTree,
      addressQueue,
      address,
      program,
      outputMerkleTree,
      signer,
      new anchor.BN(42) // initial value
    );

    // Verify creation
    let account = await rpc.getCompressedAccount(bn(address.toBytes()));
    let data = coder.types.decode("MyCompressedData", account.data.data);
    console.log("Created account:", data);
    assert.equal(data.value.toNumber(), 42);

    // Update compressed account
    await updateCompressedAccount(
      rpc,
      data.value,
      account,
      program,
      outputMerkleTree,
      signer,
      new anchor.BN(100) // new value
    );

    // Verify update
    account = await rpc.getCompressedAccount(bn(address.toBytes()));
    data = coder.types.decode("MyCompressedData", account.data.data);
    console.log("Updated account:", data);
    assert.equal(data.value.toNumber(), 100);

    // Delete compressed account
    await deleteCompressedAccount(
      rpc,
      data.value,
      account,
      program,
      outputMerkleTree,
      signer
    );

    // Verify deletion
    const deletedAccount = await rpc.getCompressedAccount(bn(address.toBytes()));
    console.log("Deleted account:", deletedAccount);
    assert.isTrue(deletedAccount.data.data.length === 0);
  });
});

async function createCompressedAccount(
  rpc: Rpc,
  addressTree: web3.PublicKey,
  addressQueue: web3.PublicKey,
  address: web3.PublicKey,
  program: Program<ZkCompression>,
  outputMerkleTree: web3.PublicKey,
  signer: web3.Keypair,
  value: anchor.BN
) {
  const proofRpcResult = await rpc.getValidityProofV0(
    [],
    [{ tree: addressTree, queue: addressQueue, address: bn(address.toBytes()) }]
  );

  const systemAccountConfig = SystemAccountMetaConfig.new(program.programId);
  const remainingAccounts = PackedAccounts.newWithSystemAccounts(systemAccountConfig);

  const addressMerkleTreePubkeyIndex = remainingAccounts.insertOrGet(addressTree);
  const addressQueuePubkeyIndex = remainingAccounts.insertOrGet(addressQueue);
  const outputMerkleTreeIndex = remainingAccounts.insertOrGet(outputMerkleTree);

  const packedAddressTreeInfo = {
    rootIndex: proofRpcResult.rootIndices[0],
    addressMerkleTreePubkeyIndex,
    addressQueuePubkeyIndex,
  };

  const proof = { 0: proofRpcResult.compressedProof };

  const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1000000,
  });

  const tx = await program.methods
    .create(proof, packedAddressTreeInfo, outputMerkleTreeIndex, value)
    .accounts({ signer: signer.publicKey })
    .preInstructions([computeBudgetIx])
    .remainingAccounts(remainingAccounts.toAccountMetas().remainingAccounts)
    .signers([signer])
    .transaction();

  tx.recentBlockhash = (await rpc.getRecentBlockhash()).blockhash;
  tx.sign(signer);

  const sig = await rpc.sendTransaction(tx, [signer]);
  await confirmTx(rpc, sig);
  console.log("Created compressed account:", sig);
}

async function updateCompressedAccount(
  rpc: Rpc,
  currentValue: anchor.BN,
  account: CompressedAccountWithMerkleContext,
  program: Program<ZkCompression>,
  outputMerkleTree: web3.PublicKey,
  signer: web3.Keypair,
  newValue: anchor.BN
) {
  const proofRpcResult = await rpc.getValidityProofV0(
    [{ hash: account.hash, tree: account.treeInfo.tree, queue: account.treeInfo.queue }],
    []
  );

  const systemAccountConfig = SystemAccountMetaConfig.new(program.programId);
  const remainingAccounts = PackedAccounts.newWithSystemAccounts(systemAccountConfig);

  const merkleTreePubkeyIndex = remainingAccounts.insertOrGet(account.treeInfo.tree);
  const queuePubkeyIndex = remainingAccounts.insertOrGet(account.treeInfo.queue);
  const outputMerkleTreeIndex = remainingAccounts.insertOrGet(outputMerkleTree);

  const compressedAccountMeta = {
    treeInfo: {
      rootIndex: proofRpcResult.rootIndices[0],
      proveByIndex: false,
      merkleTreePubkeyIndex,
      queuePubkeyIndex,
      leafIndex: account.leafIndex,
    },
    address: account.address,
    outputStateTreeIndex: outputMerkleTreeIndex,
  };

  const proof = { 0: proofRpcResult.compressedProof };

  const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1000000,
  });

  const tx = await program.methods
    .update(proof, compressedAccountMeta, currentValue, newValue)
    .accounts({ signer: signer.publicKey })
    .preInstructions([computeBudgetIx])
    .remainingAccounts(remainingAccounts.toAccountMetas().remainingAccounts)
    .signers([signer])
    .transaction();

  tx.recentBlockhash = (await rpc.getRecentBlockhash()).blockhash;
  tx.sign(signer);

  const sig = await rpc.sendTransaction(tx, [signer]);
  await confirmTx(rpc, sig);
  console.log("Updated compressed account:", sig);
}

async function deleteCompressedAccount(
  rpc: Rpc,
  currentValue: anchor.BN,
  account: CompressedAccountWithMerkleContext,
  program: Program<ZkCompression>,
  outputMerkleTree: web3.PublicKey,
  signer: web3.Keypair
) {
  const proofRpcResult = await rpc.getValidityProofV0(
    [{ hash: account.hash, tree: account.treeInfo.tree, queue: account.treeInfo.queue }],
    []
  );

  const systemAccountConfig = SystemAccountMetaConfig.new(program.programId);
  const remainingAccounts = PackedAccounts.newWithSystemAccounts(systemAccountConfig);

  const merkleTreePubkeyIndex = remainingAccounts.insertOrGet(account.treeInfo.tree);
  const queuePubkeyIndex = remainingAccounts.insertOrGet(account.treeInfo.queue);
  const outputMerkleTreeIndex = remainingAccounts.insertOrGet(outputMerkleTree);

  const compressedAccountMeta = {
    treeInfo: {
      rootIndex: proofRpcResult.rootIndices[0],
      proveByIndex: false,
      merkleTreePubkeyIndex,
      queuePubkeyIndex,
      leafIndex: account.leafIndex,
    },
    address: account.address,
    outputStateTreeIndex: outputMerkleTreeIndex,
  };

  const proof = { 0: proofRpcResult.compressedProof };

  const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1000000,
  });

  const tx = await program.methods
    .delete(proof, compressedAccountMeta, currentValue)
    .accounts({ signer: signer.publicKey })
    .preInstructions([computeBudgetIx])
    .remainingAccounts(remainingAccounts.toAccountMetas().remainingAccounts)
    .signers([signer])
    .transaction();

  tx.recentBlockhash = (await rpc.getRecentBlockhash()).blockhash;
  tx.sign(signer);

  const sig = await rpc.sendTransaction(tx, [signer]);
  await confirmTx(rpc, sig);
  console.log("Deleted compressed account:", sig);
}
