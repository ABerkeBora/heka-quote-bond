import {
  publicClient,
  deployment,
  abi,
  roles,
  callTx,
} from "../server/chain.mjs";
import { read, acquireRuntime } from "../server/store.mjs";
import { toHex } from "viem";
const args = process.argv.slice(2);
const val = (k) => args[args.indexOf(k) + 1];
if (!args.includes("--file") || !args.includes("--quote"))
  throw Error(
    "Usage: npm run submit-response -- --file response.json --quote 0xQUOTE_ID [--broadcast]",
  );
const r = read(val("--file"));
if (
  !r ||
  typeof r.data !== "string" ||
  !/^\d+$/.test(r.timestamp) ||
  !/^0x[0-9a-fA-F]{130}$/.test(r.signature) ||
  !/^0x[0-9a-fA-F]{64}$/.test(val("--quote"))
)
  throw Error("Invalid envelope or quote ID");
const qid = val("--quote"),
  d = deployment();
const call = {
  address: d.contract,
  abi: abi(),
  functionName: "payApprovedQuote",
  args: [qid, BigInt(r.timestamp), toHex(r.data), r.signature],
  account: d.reserveFunder,
};
// Deliberately no off-chain signature verification: judges test the deployed contract itself.
if (!args.includes("--broadcast")) {
  try {
    const result = await publicClient.simulateContract(call);
    console.log(
      "ACCEPTED by deployed contract simulation",
      result.request.functionName,
    );
  } catch (e) {
    console.error(e.shortMessage || e.message);
    process.exitCode = 1;
  }
} else {
  acquireRuntime();
  const receipt = await callTx(
    `judge:${qid}:${r.signature}`,
    "deployer",
    d.contract,
    abi(),
    call.functionName,
    call.args,
    { allowRevert: true, gasCap: 200000000000000n },
  );
  console.log(JSON.stringify(receipt));
}
