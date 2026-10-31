import { toHex } from "viem";
import { read } from "../server/store.mjs";
import { deployment, publicClient, abi, callTx } from "../server/v2/chain.mjs";
import { acquireRuntime } from "../server/v2/store.mjs";
const args = process.argv.slice(2),
  val = (k) => args[args.indexOf(k) + 1];
if (!args.includes("--file") || !args.includes("--quote"))
  throw Error(
    "Usage: npm run v2:submit-response -- --file response.json --quote 0xQUOTE [--broadcast]",
  );
const source = read(val("--file"));
const r = source?.response || source;
const id = val("--quote");
if (
  !r ||
  typeof r.data !== "string" ||
  !/^\d+$/.test(r.timestamp) ||
  !/^0x[0-9a-fA-F]{130}$/.test(r.signature) ||
  !/^0x[0-9a-fA-F]{64}$/.test(id)
)
  throw Error("Invalid raw response or quote ID");
const d = deployment(),
  call = {
    address: d.contract,
    abi: abi(),
    functionName: "payApprovedQuote",
    args: [id, BigInt(r.timestamp), toHex(r.data), r.signature],
    account: d.reserveFunder,
  };
// Intentionally bypass the off-chain signature/coverage guard: the deployed V2 contract is the judge.
if (!args.includes("--broadcast")) {
  try {
    await publicClient.simulateContract(call);
    console.log("ACCEPTED by current deployed V2 contract simulation");
  } catch (e) {
    let decoded = e;
    while (decoded && !decoded.data?.errorName) decoded = decoded.cause;
    if (decoded?.data?.errorName) {
      console.error("REJECTED: " + decoded.data.errorName);
      process.exitCode = 1;
    } else {
      console.error("RPC/INPUT ERROR: " + (e.shortMessage || e.message));
      process.exitCode = 2;
    }
  }
} else {
  acquireRuntime();
  const receipt = await callTx(
    `judge:${id}:${r.signature}`,
    "deployer",
    d.contract,
    abi(),
    call.functionName,
    call.args,
    { allowRevert: true, gasCap: 200000000000000n },
  );
  console.log(JSON.stringify(receipt));
}
