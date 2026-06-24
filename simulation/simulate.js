require('dotenv').config();
const { ethers } = require('ethers');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');

const ABI = [
  "function registerOfficer(address officer, uint8 sector) external",
  "function registerValidator(address validator, uint8 role) external",
  "function submitBudgetAnchor(bytes32 budgetHash, uint256 amount) external returns (bytes32)",
  "function validateAnchor(bytes32 anchorID, bool approved, string memory reason) external",
  "function recordRealization(bytes32 anchorID, uint256 realizationAmount, bytes32 evidenceHash) external",
  "function getStatus(bytes32 anchorID) external view returns (uint8)"
];

const SECTORS = ['DEF','EDU','HLT','ICT','INF','SOC'];
const CYCLES_PER_SECTOR = 100;

const csvWriter = createObjectCsvWriter({
  path: 'results.csv',
  header: [
    { id: 'cycle', title: 'Cycle' },
    { id: 'sector', title: 'Sector' },
    { id: 'submit_time_ms', title: 'Submit_Time_ms' },
    { id: 'bav_time_ms', title: 'BAV_Time_ms' },
    { id: 'icv_time_ms', title: 'ICV_Time_ms' },
    { id: 'realize_time_ms', title: 'Realize_Time_ms' },
    { id: 'total_time_ms', title: 'Total_Time_ms' },
    { id: 'submit_gas', title: 'Submit_Gas' },
    { id: 'icv_gas', title: 'ICV_Gas' },
    { id: 'realize_gas', title: 'Realize_Gas' },
    { id: 'status', title: 'Status' }
  ],
  append: false
});

let firstWrite = true;

async function saveRecord(record) {
  if (firstWrite) {
    await csvWriter.writeRecords([record]);
    firstWrite = false;
  } else {
    const appendWriter = createObjectCsvWriter({
      path: 'results.csv',
      header: [
        { id: 'cycle', title: 'Cycle' },
        { id: 'sector', title: 'Sector' },
        { id: 'submit_time_ms', title: 'Submit_Time_ms' },
        { id: 'bav_time_ms', title: 'BAV_Time_ms' },
        { id: 'icv_time_ms', title: 'ICV_Time_ms' },
        { id: 'realize_time_ms', title: 'Realize_Time_ms' },
        { id: 'total_time_ms', title: 'Total_Time_ms' },
        { id: 'submit_gas', title: 'Submit_Gas' },
        { id: 'icv_gas', title: 'ICV_Gas' },
        { id: 'realize_gas', title: 'Realize_Gas' },
        { id: 'status', title: 'Status' }
      ],
      append: true
    });
    await appendWriter.writeRecords([record]);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const ganWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, ganWallet);

  const bavWallet = ethers.Wallet.createRandom().connect(provider);
  const icvWallet = ethers.Wallet.createRandom().connect(provider);

  console.log("Registering validators...");
  let tx = await contract.registerValidator(bavWallet.address, 1);
  await tx.wait();
  console.log("BAV registered");

  tx = await contract.registerValidator(icvWallet.address, 2);
  await tx.wait();
  console.log("ICV registered");

  // Fund BAV and ICV
  const fundBAV = await ganWallet.sendTransaction({
    to: bavWallet.address,
    value: ethers.parseEther("0.003")
  });
  await fundBAV.wait();

  const fundICV = await ganWallet.sendTransaction({
    to: icvWallet.address,
    value: ethers.parseEther("0.003")
  });
  await fundICV.wait();
  console.log("BAV and ICV funded");

  for (let s = 0; s < SECTORS.length; s++) {
    const sector = SECTORS[s];
    console.log(`\nProcessing sector: ${sector}`);

    const officerWallet = ethers.Wallet.createRandom().connect(provider);

    tx = await contract.registerOfficer(officerWallet.address, s);
    await tx.wait();
    console.log(`Officer registered for ${sector}`);

    const fundTx = await ganWallet.sendTransaction({
      to: officerWallet.address,
      value: ethers.parseEther("0.002")
    });
    await fundTx.wait();
    console.log(`Officer funded for ${sector}`);

    const officerContract = contract.connect(officerWallet);
    const bavContract = contract.connect(bavWallet);
    const icvContract = contract.connect(icvWallet);

    for (let i = 1; i <= CYCLES_PER_SECTOR; i++) {
      try {
        const budgetHash = ethers.keccak256(
          ethers.toUtf8Bytes(`${sector}-${i}-${Date.now()}`)
        );
        const amount = ethers.parseEther("1.0");

        // Stage 1: Submit
        const t1 = Date.now();
        const submitTx = await officerContract.submitBudgetAnchor(budgetHash, amount);
        const submitReceipt = await submitTx.wait();
        const t2 = Date.now();

        const anchorID = submitReceipt.logs[0]?.topics[1];

        // Stage 2: BAV validate
        const t3 = Date.now();
        const bavTx = await bavContract.validateAnchor(anchorID, true, "");
        const bavReceipt = await bavTx.wait();
        const t4 = Date.now();

        // Stage 3: ICV validate
        const t5 = Date.now();
        const icvTx = await icvContract.validateAnchor(anchorID, true, "");
        const icvReceipt = await icvTx.wait();
        const t6 = Date.now();

        // Stage 4: GAN realize
        const evidenceHash = ethers.keccak256(
          ethers.toUtf8Bytes(`evidence-${sector}-${i}`)
        );
        const t7 = Date.now();
        const realizeTx = await contract.recordRealization(anchorID, amount, evidenceHash);
        const realizeReceipt = await realizeTx.wait();
        const t8 = Date.now();

        const record = {
          cycle: `${s * CYCLES_PER_SECTOR + i}`,
          sector: sector,
          submit_time_ms: t2 - t1,
          bav_time_ms: t4 - t3,
          icv_time_ms: t6 - t5,
          realize_time_ms: t8 - t7,
          total_time_ms: t8 - t1,
          submit_gas: submitReceipt.gasUsed.toString(),
          icv_gas: icvReceipt.gasUsed.toString(),
          realize_gas: realizeReceipt.gasUsed.toString(),
          status: 'SUCCESS'
        };

        await saveRecord(record);
        console.log(`${sector} cycle ${i}/100 done - total: ${t8-t1}ms`);

      } catch (err) {
        console.error(`${sector} cycle ${i} failed:`, err.message);
        const record = {
          cycle: `${s * CYCLES_PER_SECTOR + i}`,
          sector: sector,
          submit_time_ms: 0,
          bav_time_ms: 0,
          icv_time_ms: 0,
          realize_time_ms: 0,
          total_time_ms: 0,
          submit_gas: 0,
          icv_gas: 0,
          realize_gas: 0,
          status: 'FAILED'
        };
        await saveRecord(record);
      }
    }
  }

  console.log('\nDone! Results saved to results.csv');
}

main().catch(console.error);
