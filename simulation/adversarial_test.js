require('dotenv').config();
const { ethers } = require('ethers');

const ABI = [
  "function registerOfficer(address officer, uint8 sector) external",
  "function registerValidator(address validator, uint8 role) external",
  "function submitBudgetAnchor(bytes32 budgetHash, uint256 amount) external returns (bytes32)",
  "function validateAnchor(bytes32 anchorID, bool approved, string memory reason) external",
  "function recordRealization(bytes32 anchorID, uint256 realizationAmount, bytes32 evidenceHash) external",
  "function getStatus(bytes32 anchorID) external view returns (uint8)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const ganWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const bavWallet = new ethers.Wallet(process.env.PRIVATE_KEY_BAV, provider);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, ganWallet);

  console.log("=== ADVERSARIAL TESTING ===\n");

  const officerDEF = ethers.Wallet.createRandom().connect(provider);
  const officerEDU = ethers.Wallet.createRandom().connect(provider);
  const icvWallet = ethers.Wallet.createRandom().connect(provider);

  console.log("Funding wallets...");
  for (const w of [officerDEF, officerEDU, icvWallet]) {
    const tx = await ganWallet.sendTransaction({
      to: w.address,
      value: ethers.parseEther("0.005")
    });
    await tx.wait();
  }

  let tx;
  tx = await contract.registerOfficer(officerDEF.address, 0); await tx.wait();
  tx = await contract.registerOfficer(officerEDU.address, 1); await tx.wait();
  tx = await contract.registerValidator(bavWallet.address, 1); await tx.wait();
  tx = await contract.registerValidator(icvWallet.address, 2); await tx.wait();
  console.log("Roles registered\n");

  // TEST CASE 1: Wrong DepartmentID
  console.log("TEST CASE 1: Wrong DepartmentID");
  try {
    const wrongContract = contract.connect(officerEDU);
    const budgetHash = ethers.keccak256(ethers.toUtf8Bytes(`WRONG-DEF-${Date.now()}`));
    const submitTx = await wrongContract.submitBudgetAnchor(budgetHash, ethers.parseEther("1.0"));
    await submitTx.wait();
    console.log("RESULT: Transaction succeeded - RBAC NOT enforced");
    console.log("TxHash:", submitTx.hash);
  } catch (err) {
    console.log("RESULT: Rejected - RBAC enforced correctly");
    console.log("Error:", err.message.substring(0, 100));
  }

  // TEST CASE 2: Single Validator Only
  console.log("\nTEST CASE 2: Single validator only");
  try {
    const officerContract = contract.connect(officerDEF);
    const budgetHash = ethers.keccak256(ethers.toUtf8Bytes(`SINGLE-VAL-${Date.now()}`));
    const submitTx = await officerContract.submitBudgetAnchor(budgetHash, ethers.parseEther("1.0"));
    const submitReceipt = await submitTx.wait();
    const anchorID = submitReceipt.logs[0]?.topics[1];
    console.log("Anchor submitted, ID:", anchorID);

    const bavContract = contract.connect(bavWallet);
    const bavTx = await bavContract.validateAnchor(anchorID, true, "");
    await bavTx.wait();
    console.log("BAV approved");

    const status = await contract.getStatus(anchorID);
    console.log("Status after BAV only:", status.toString());
    if (status.toString() === "2") {
      console.log("RESULT: VALIDATED with single validator - AND-join NOT enforced");
    } else {
      console.log("RESULT: Not VALIDATED - AND-join enforced correctly");
    }
  } catch (err) {
    console.log("Error:", err.message.substring(0, 100));
  }

  // TEST CASE 3: Terminal Rejection
  console.log("\nTEST CASE 3: Terminal rejection");
  try {
    const officerContract = contract.connect(officerDEF);
    const budgetHash = ethers.keccak256(ethers.toUtf8Bytes(`TERMINAL-${Date.now()}`));
    const submitTx = await officerContract.submitBudgetAnchor(budgetHash, ethers.parseEther("1.0"));
    const submitReceipt = await submitTx.wait();
    const anchorID = submitReceipt.logs[0]?.topics[1];
    console.log("Anchor submitted, ID:", anchorID);

    const bavContract = contract.connect(bavWallet);
    for (let i = 1; i <= 4; i++) {
      try {
        const rejectTx = await bavContract.validateAnchor(anchorID, false, "FRAUD");
        await rejectTx.wait();
        const status = await contract.getStatus(anchorID);
        console.log(`Rejection ${i} - Status: ${status.toString()}`);
      } catch (err) {
        console.log(`Rejection ${i} - Contract rejected: ${err.message.substring(0, 80)}`);
      }
    }

    const finalStatus = await contract.getStatus(anchorID);
    console.log("Final status:", finalStatus.toString());
    if (finalStatus.toString() === "5") {
      console.log("RESULT: TERMINAL_REJECTED confirmed");
    } else {
      console.log("RESULT: Status code", finalStatus.toString());
    }
  } catch (err) {
    console.log("Error:", err.message.substring(0, 100));
  }

  console.log("\n=== TESTING COMPLETE ===");
}

main().catch(console.error);
