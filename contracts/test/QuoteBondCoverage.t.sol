// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QuoteBondCoverage} from "../QuoteBondCoverage.sol";
import {TestToken6} from "../TestToken6.sol";
import {AirnodeV2Attestation} from "../vendor/AirnodeV2Attestation.sol";
import {ProjectedJson} from "../vendor/ProjectedJson.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface VmCoverage {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function addr(uint256) external returns (address);
    function chainId(uint256) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectPartialRevert(bytes4) external;
}

/// @dev Unit signatures intentionally use a synthetic signer. Real Nodary responses and Base Sepolia evidence
/// are exercised separately by the integration scripts; these tests isolate policy and monetary invariants.
contract QuoteBondCoverageTest {
    VmCoverage internal constant vm = VmCoverage(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    address internal constant BUYER = address(0xB0B);
    address internal constant MERCHANT = address(0xCAFE);
    address internal constant EXECUTOR = address(0x1234);
    bytes32 internal constant REQUEST = keccak256("fixed USDC/USD + USDT/USD request");
    bytes32 internal constant ID = keccak256("invoice-1");
    TestToken6 internal usdc;
    TestToken6 internal usdt;
    QuoteBondCoverage internal bond;

    function setUp() public {
        vm.warp(2_000_000);
        usdc = new TestToken6("Test USDC", "tUSDC");
        usdt = new TestToken6("Test USDT", "tUSDT");
        bond = new QuoteBondCoverage(address(usdc), address(usdt), vm.addr(SIGNER_KEY), REQUEST);
        usdc.mint(BUYER, 1000e6);
        usdt.mint(address(this), 1000e6);
        usdt.approve(address(bond), 1000e6);
        _create(ID, 110e18, 100e6, 25e6);
        _accept(ID);
        vm.startPrank(BUYER);
        usdc.approve(address(bond), 100e6);
        bond.authorize(ID, uint64(block.timestamp + 1800), 100e6);
        vm.stopPrank();
    }

    function _create(bytes32 id, uint256 usd, uint256 escrow, uint256 reserve) internal {
        bond.createQuote(id, BUYER, MERCHANT, usd, escrow, reserve, uint64(block.timestamp),
            uint64(block.timestamp + 900), uint64(block.timestamp + 2700), usd, uint64(block.timestamp + 2700));
    }

    function _data(string memory usdcPrice, string memory usdtPrice, uint256 observedAt) internal pure returns (bytes memory) {
        return abi.encodePacked('{"usdc":', usdcPrice, ',"usdcUpdatedAt":', Strings.toString(observedAt * 1000),
            ',"usdt":', usdtPrice, ',"usdtUpdatedAt":', Strings.toString(observedAt * 1000), '}');
    }

    function _signature(bytes32 request, uint256 timestamp, bytes memory data, uint256 key) internal returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encodePacked(request, timestamp, data)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _pay(bytes memory data) internal {
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.prank(EXECUTOR);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
    }

    function _unchanged() internal view {
        require(usdc.balanceOf(BUYER) == 1000e6, "payer changed");
        require(usdc.balanceOf(MERCHANT) == 0 && usdt.balanceOf(MERCHANT) == 0, "merchant changed");
        require(usdt.balanceOf(address(bond)) == 25e6 && bond.totalReservedUsdt() == 25e6, "reserve changed");
        require(bond.getQuote(ID).state == QuoteBondCoverage.State.Active, "state changed");
    }

    function testValidPermissionlessPositiveTopup() public {
        _pay(_data("1", "1", block.timestamp));
        require(usdc.balanceOf(MERCHANT) == 100e6 && usdt.balanceOf(MERCHANT) == 10e6, "incorrect payout");
        require(usdc.balanceOf(BUYER) == 900e6 && usdc.allowance(BUYER, address(bond)) == 0, "not exact debit");
        require(usdt.balanceOf(address(this)) == 990e6 && usdt.balanceOf(address(bond)) == 0, "unused not returned");
        require(bond.getQuote(ID).state == QuoteBondCoverage.State.Settled && bond.totalReservedUsdt() == 0, "state");
    }

    function testZeroTopup() public {
        _pay(_data("1.1", "0.8", block.timestamp));
        require(usdt.balanceOf(MERCHANT) == 0 && usdt.balanceOf(address(this)) == 1000e6, "reserve touched");
        require(bond.getQuote(ID).paidUsdt == 0, "topup");
    }

    function testUsdtIsNotHardcodedToOne() public {
        _pay(_data("1", "0.8", block.timestamp));
        require(usdt.balanceOf(MERCHANT) == 12_500_000, "USDT price ignored");
    }

    function testReserveCapsAndRecordsUncoveredAmount() public {
        _pay(_data("0.5", "0.8", block.timestamp));
        QuoteBondCoverage.Quote memory q = bond.getQuote(ID);
        require(q.state == QuoteBondCoverage.State.Capped && q.paidUsdt == 25e6, "not capped");
        require(q.uncoveredUsd18 == 40e18, "uncovered");
        require(usdt.balanceOf(MERCHANT) == 25e6 && usdt.balanceOf(address(bond)) == 0, "cap payout");
    }

    function testCeilRounding() public {
        _pay(_data("1.099999999999999999", "0.999", block.timestamp));
        require(usdt.balanceOf(MERCHANT) == 1, "must ceil one atom");
    }

    function testEditedRealShapeRejectedBeforeFundsMove() public {
        bytes memory original = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, original, SIGNER_KEY);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        bond.payApprovedQuote(ID, block.timestamp, _data("0.1", "1", block.timestamp), sig);
        _unchanged();
    }

    function testStaleEnvelopeRejected() public {
        uint256 old = 2_000_000;
        bytes memory data = _data("1", "1", old);
        bytes memory sig = _signature(REQUEST, old, data, SIGNER_KEY);
        vm.warp(old + 121);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.ResponseTooOld.selector, old));
        bond.payApprovedQuote(ID, old, data, sig);
        _unchanged();
    }

    function testDifferentRequestRejected() public {
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(keccak256("another request"), block.timestamp, data, SIGNER_KEY);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testWrongSignerRejected() public {
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, 0xBAD);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testFreshSignatureCannotRefreshOldObservation() public {
        bytes memory data = _data("1", "1", block.timestamp - 301);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.SourceTooOld.selector, "USDC/USD", block.timestamp - 301));
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testUsdtObservationCheckedSeparately() public {
        bytes memory data = abi.encodePacked('{"usdc":1,"usdcUpdatedAt":', Strings.toString(block.timestamp * 1000),
            ',"usdt":1,"usdtUpdatedAt":', Strings.toString((block.timestamp - 301) * 1000), '}');
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.SourceTooOld.selector, "USDT/USD", block.timestamp - 301));
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testFutureEnvelopeRejected() public {
        uint256 future = block.timestamp + 61;
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, future, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.FutureTimestamp.selector, future));
        bond.payApprovedQuote(ID, future, data, sig);
        _unchanged();
    }

    function testFutureSourceRejected() public {
        bytes memory data = _data("1", "1", block.timestamp + 61);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.FutureTimestamp.selector, block.timestamp + 61));
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testMissingPriceRejected() public {
        bytes memory data = '{"usdc":1}';
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(ProjectedJson.FieldNotFound.selector, "usdt"));
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testZeroPriceRejected() public {
        bytes memory data = _data("1", "0", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(QuoteBondCoverage.InvalidPrice.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testMalformedOrNegativePriceRejected() public {
        bytes memory data = _data("-1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert();
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testDoubleSettlementRejected() public {
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        require(usdc.balanceOf(BUYER) == 900e6 && usdt.balanceOf(MERCHANT) == 10e6, "paid twice");
    }

    function testOnlyPinnedPayerCanAuthorize() public {
        vm.prank(EXECUTOR);
        vm.expectRevert(QuoteBondCoverage.OnlyPayer.selector);
        bond.authorize(ID, uint64(block.timestamp + 100), 100e6);
        _unchanged();
    }

    function testOverBudgetMandateRejected() public {
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        bond.authorize(ID, uint64(block.timestamp + 100), 99e6);
        _unchanged();
    }

    function testMandateCannotExtendBeyondThirtyMinutes() public {
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        bond.authorize(ID, uint64(block.timestamp + 1801), 100e6);
        _unchanged();
    }

    function testExpiredMandateRejected() public {
        vm.warp(block.timestamp + 1801);
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(QuoteBondCoverage.MandateExpired.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testMandateClosesExactlyAtExpiry() public {
        vm.warp(2_001_800);
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(QuoteBondCoverage.MandateExpired.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testRevokeThenCannotPay() public {
        vm.prank(BUYER);
        bond.revoke(ID);
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        require(usdc.balanceOf(BUYER) == 1000e6 && bond.getQuote(ID).state == QuoteBondCoverage.State.Funded, "revoked pay");
    }

    function testTransferFailureRevertsStateAndReserve() public {
        vm.prank(BUYER);
        usdc.approve(address(bond), 0);
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert();
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        _unchanged();
    }

    function testReserveCannotBeDoubleAllocated() public {
        uint256 reservedBefore = bond.totalReservedUsdt();
        _create(keccak256("invoice-2"), 110e18, 100e6, 25e6);
        require(bond.totalReservedUsdt() == reservedBefore + 25e6, "reserved total");
        require(usdt.balanceOf(address(bond)) == 50e6 && usdt.balanceOf(address(this)) == 950e6, "unbacked reserve");
    }

    function testInsufficientReserveFundingCannotCreateQuote() public {
        bytes32 second = keccak256("insufficient");
        vm.expectRevert();
        _create(second, 100e18, 100e6, 5000e6);
        require(bond.getQuote(second).state == QuoteBondCoverage.State.None, "quote created");
        _unchanged();
    }

    function testDuplicateQuoteIdCannotOverwriteMerchant() public {
        vm.expectRevert(QuoteBondCoverage.QuoteAlreadyExists.selector);
        bond.createQuote(ID, BUYER, EXECUTOR, 110e18, 100e6, 25e6, uint64(block.timestamp),
            uint64(block.timestamp + 900), uint64(block.timestamp + 2700), 110e18, uint64(block.timestamp + 2700));
        require(bond.getQuote(ID).beneficiary == MERCHANT, "recipient changed");
        _unchanged();
    }

    function testNoEarlyVoid() public {
        vm.expectRevert(QuoteBondCoverage.NotYetVoidable.selector);
        bond.voidQuote(ID);
        _unchanged();
    }

    function testVoidAfterHardDeadlineReturnsReserveAndNeverDebitsBuyer() public {
        vm.warp(block.timestamp + 2701);
        vm.prank(EXECUTOR);
        bond.voidQuote(ID);
        require(bond.getQuote(ID).state == QuoteBondCoverage.State.Voided && bond.totalReservedUsdt() == 0, "void state");
        require(usdt.balanceOf(address(this)) == 1000e6 && usdc.balanceOf(BUYER) == 1000e6, "refund");
        require(usdc.balanceOf(MERCHANT) == 0 && usdt.balanceOf(MERCHANT) == 0, "void payout");
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.voidQuote(ID);
    }

    function testGraceUsesSameFreshnessRules() public {
        vm.warp(block.timestamp + 901);
        _pay(_data("1", "1", block.timestamp));
        require(bond.getQuote(ID).state == QuoteBondCoverage.State.Settled, "grace settlement");
    }

    function testSettledQuoteCannotBeVoided() public {
        _pay(_data("1", "1", block.timestamp));
        vm.warp(block.timestamp + 3000);
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.voidQuote(ID);
    }

    function testSettledQuoteCannotBeReauthorized() public {
        _pay(_data("1", "1", block.timestamp));
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.authorize(ID, uint64(block.timestamp + 1800), 100e6);
        require(usdc.balanceOf(BUYER) == 900e6 && usdt.balanceOf(MERCHANT) == 10e6, "repaid");
    }

    function testVoidedQuoteCannotBeReauthorized() public {
        vm.warp(2_002_701);
        bond.voidQuote(ID);
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.QuoteNotActive.selector);
        bond.authorize(ID, uint64(block.timestamp + 1800), 100e6);
        require(usdc.balanceOf(BUYER) == 1000e6 && usdt.balanceOf(address(bond)) == 0, "revived");
    }

    function testPreviewEqualsActualPayment() public {
        bytes memory data = _data("0.999", "1.001", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        QuoteBondCoverage.Calculation memory c = bond.preview(ID, block.timestamp, data, sig);
        bond.payApprovedQuote(ID, block.timestamp, data, sig);
        require(usdt.balanceOf(MERCHANT) == c.paidUsdt && bond.getQuote(ID).uncoveredUsd18 == c.uncoveredUsd18, "preview differs");
    }

    function _accept(bytes32 id) internal {
        bytes32 policy = bond.policyHash(id);
        vm.prank(MERCHANT);
        bond.acceptCoverage(id, policy);
    }

    function _policyQuote(bytes32 id, uint256 usd, uint256 maxUncovered, uint64 expiry) internal {
        bond.createQuote(id, BUYER, MERCHANT, usd, 100e6, 25e6, uint64(block.timestamp),
            uint64(block.timestamp + 900), uint64(block.timestamp + 2700), maxUncovered, expiry);
    }

    function _authorize(bytes32 id, uint64 expiry) internal {
        vm.prank(BUYER);
        bond.authorize(id, expiry, 100e6);
    }

    function _payId(bytes32 id, bytes memory data) internal {
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.prank(EXECUTOR);
        bond.payApprovedQuote(id, block.timestamp, data, sig);
    }

    function _extraQuoteUnchanged(bytes32 id, bool accepted) internal view {
        require(usdc.balanceOf(BUYER) == 1000e6 && usdc.balanceOf(MERCHANT) == 0, "USDC changed");
        require(usdt.balanceOf(MERCHANT) == 0 && usdt.balanceOf(address(bond)) == 50e6, "USDT changed");
        require(bond.totalReservedUsdt() == 50e6, "reserve accounting changed");
        QuoteBondCoverage.Quote memory q = bond.getQuote(id);
        require(q.state == QuoteBondCoverage.State.Active && q.merchantAccepted == accepted, "quote changed");
        require(q.paidUsdt == 0 && q.uncoveredUsd18 == 0, "payment recorded");
    }

    function testMerchantAcceptanceRequiredEvenWithBuyerMandate() public {
        bytes32 id = keccak256("not-accepted");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1800));
        _authorize(id, uint64(block.timestamp + 1800));
        vm.expectRevert(QuoteBondCoverage.MerchantNotAccepted.selector);
        _payId(id, _data("1", "1", block.timestamp));
        _extraQuoteUnchanged(id, false);
    }

    function testOnlyMerchantCanAccept() public {
        bytes32 id = keccak256("wrong-acceptor");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1800));
        bytes32 hash = bond.policyHash(id);
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.OnlyMerchant.selector);
        bond.acceptCoverage(id, hash);
        vm.prank(EXECUTOR);
        vm.expectRevert(QuoteBondCoverage.OnlyMerchant.selector);
        bond.acceptCoverage(id, hash);
        require(!bond.getQuote(id).merchantAccepted, "wrong merchant accepted");
    }

    function testMerchantReviewedHashMustMatch() public {
        bytes32 id = keccak256("wrong-policy-hash");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1800));
        vm.prank(MERCHANT);
        vm.expectPartialRevert(QuoteBondCoverage.PolicyHashMismatch.selector);
        bond.acceptCoverage(id, keccak256("changed policy"));
        require(!bond.getQuote(id).merchantAccepted, "changed policy accepted");
    }

    function testAcceptanceIsOnlyForItsOwnQuote() public {
        bytes32 id = keccak256("other-quote");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1800));
        bytes32 wrongHash = bond.policyHash(ID);
        vm.prank(MERCHANT);
        vm.expectPartialRevert(QuoteBondCoverage.PolicyHashMismatch.selector);
        bond.acceptCoverage(id, wrongHash);
        _authorize(id, uint64(block.timestamp + 1800));
        vm.expectRevert(QuoteBondCoverage.MerchantNotAccepted.selector);
        _payId(id, _data("1", "1", block.timestamp));
        _extraQuoteUnchanged(id, false);
    }

    function testAcceptanceIsOnlyForItsOwnDeployment() public {
        QuoteBondCoverage other = new QuoteBondCoverage(address(usdc), address(usdt), vm.addr(SIGNER_KEY), REQUEST);
        usdt.approve(address(other), 25e6);
        other.createQuote(ID, BUYER, MERCHANT, 110e18, 100e6, 25e6, uint64(block.timestamp),
            uint64(block.timestamp + 900), uint64(block.timestamp + 2700), 110e18, uint64(block.timestamp + 2700));
        bytes32 wrongHash = bond.policyHash(ID);
        require(other.policyHash(ID) != wrongHash, "deployment missing from hash");
        vm.prank(MERCHANT);
        vm.expectPartialRevert(QuoteBondCoverage.PolicyHashMismatch.selector);
        other.acceptCoverage(ID, wrongHash);
        require(!other.getQuote(ID).merchantAccepted, "cross-deployment accepted");
    }

    function testPolicyHashIncludesChainDomain() public {
        bytes32 original = bond.policyHash(ID);
        vm.chainId(block.chainid + 1);
        require(bond.policyHash(ID) != original, "chain missing from policy hash");
    }

    function testPolicyHashExactlyBindsAllImmutableTerms() public {
        QuoteBondCoverage.Quote memory q = bond.getQuote(ID);
        bytes32 expected = keccak256(abi.encode(block.chainid, address(bond), ID, address(usdc), address(usdt),
            vm.addr(SIGNER_KEY), REQUEST, q.payer, q.beneficiary, q.funder, q.quoteUsd18, q.escrowAmount,
            q.reservedUsdt, q.maxUncoveredUSD18, q.settleAfter, q.normalDeadline, q.hardDeadline,
            q.merchantAcceptanceExpiry));
        require(bond.policyHash(ID) == expected, "policy binding mismatch");
    }

    function testAcceptedPolicyCannotBeChangedOrReaccepted() public {
        bytes32 beforeHash = bond.policyHash(ID);
        vm.prank(MERCHANT);
        vm.expectRevert(QuoteBondCoverage.MerchantAlreadyAccepted.selector);
        bond.acceptCoverage(ID, keccak256("looser policy"));
        vm.expectRevert(QuoteBondCoverage.QuoteAlreadyExists.selector);
        bond.createQuote(ID, BUYER, MERCHANT, 140e18, 100e6, 25e6, uint64(block.timestamp),
            uint64(block.timestamp + 900), uint64(block.timestamp + 2700), 40e18, uint64(block.timestamp + 2700));
        require(bond.policyHash(ID) == beforeHash && bond.getQuote(ID).maxUncoveredUSD18 == 110e18, "policy widened");
    }

    function testValidPricesButInsufficientCoverageRejectBeforeMovement() public {
        bytes32 id = keccak256("strict-coverage");
        _policyQuote(id, 140e18, 0, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.CoverageInsufficient.selector, 15e18, 0));
        _payId(id, _data("1", "1", block.timestamp));
        _extraQuoteUnchanged(id, true);
    }

    function testFullyCoveredQuoteWithZeroTolerancePays() public {
        bytes32 id = keccak256("strict-full");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        _payId(id, _data("1", "1", block.timestamp));
        QuoteBondCoverage.Quote memory q = bond.getQuote(id);
        require(q.state == QuoteBondCoverage.State.Settled && q.uncoveredUsd18 == 0, "strict payment failed");
        require(usdc.balanceOf(MERCHANT) == 100e6 && usdt.balanceOf(MERCHANT) == 10e6, "full payout");
        require(usdt.balanceOf(address(bond)) == 25e6, "other quote reserve consumed");
    }

    function testExplicitPartialCoverageAtInclusiveLimitPays() public {
        bytes32 id = keccak256("accepted-partial");
        _policyQuote(id, 140e18, 15e18, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        _payId(id, _data("1", "1", block.timestamp));
        QuoteBondCoverage.Quote memory q = bond.getQuote(id);
        require(q.state == QuoteBondCoverage.State.Capped && q.uncoveredUsd18 == 15e18, "partial rule");
        require(usdc.balanceOf(MERCHANT) == 100e6 && usdt.balanceOf(MERCHANT) == 25e6, "partial payout");
    }

    function testOneUsdWeiOverLimitRejects() public {
        bytes32 id = keccak256("limit-one-wei");
        _policyQuote(id, 140e18, 15e18 - 1, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.CoverageInsufficient.selector, 15e18, 15e18 - 1));
        _payId(id, _data("1", "1", block.timestamp));
        _extraQuoteUnchanged(id, true);
    }

    function testCeilTokenAtomCanSatisfyZeroTolerance() public {
        bytes32 id = keccak256("rounding-full");
        _policyQuote(id, 100e18 + 1, 0, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        _payId(id, _data("1", "1", block.timestamp));
        require(bond.getQuote(id).uncoveredUsd18 == 0 && bond.getQuote(id).paidUsdt == 1, "ceil coverage");
    }

    function testBuyerReauthorizationCannotWidenCoverage() public {
        bytes32 id = keccak256("buyer-cannot-relax");
        _policyQuote(id, 140e18, 0, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 100));
        vm.prank(BUYER);
        bond.revoke(id);
        _authorize(id, uint64(block.timestamp + 1800));
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.CoverageInsufficient.selector, 15e18, 0));
        _payId(id, _data("1", "1", block.timestamp));
        _extraQuoteUnchanged(id, true);
    }

    function testBuyerCannotAuthorizeBeyondMerchantExpiry() public {
        bytes32 id = keccak256("merchant-short-expiry");
        _policyQuote(id, 110e18, 0, uint64(block.timestamp + 1000));
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        bond.authorize(id, uint64(block.timestamp + 1001), 100e6);
        require(bond.getQuote(id).state == QuoteBondCoverage.State.Funded, "buyer bypassed merchant expiry");
    }

    function testMerchantAcceptanceExpiresExactlyAtBoundary() public {
        bytes32 id = keccak256("merchant-accept-expiry");
        _policyQuote(id, 110e18, 0, 2_001_000);
        bytes32 hash = bond.policyHash(id);
        vm.warp(2_001_000);
        vm.prank(MERCHANT);
        vm.expectRevert(QuoteBondCoverage.MerchantAcceptanceExpired.selector);
        bond.acceptCoverage(id, hash);
        require(!bond.getQuote(id).merchantAccepted, "late acceptance");
    }

    function testExpiredAcceptanceCannotPayOrBeRevivedByBuyer() public {
        bytes32 id = keccak256("merchant-pay-expiry");
        _policyQuote(id, 110e18, 0, 2_001_000);
        _accept(id);
        _authorize(id, 2_001_000);
        vm.prank(BUYER);
        bond.revoke(id);
        _authorize(id, 2_001_000);
        vm.warp(2_001_000);
        vm.expectRevert(QuoteBondCoverage.MerchantAcceptanceExpired.selector);
        _payId(id, _data("1", "1", block.timestamp));
        vm.prank(BUYER);
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        bond.authorize(id, 2_001_001, 100e6);
        _extraQuoteUnchanged(id, true);
    }

    function testInvalidCoverageOrAcceptanceExpiryCannotFundQuote() public {
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        _policyQuote(keccak256("invalid-limit"), 110e18, 111e18, uint64(block.timestamp + 1800));
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        _policyQuote(keccak256("expired-acceptance"), 110e18, 0, uint64(block.timestamp));
        vm.expectRevert(QuoteBondCoverage.InvalidTerms.selector);
        _policyQuote(keccak256("too-late-acceptance"), 110e18, 0, uint64(block.timestamp + 2701));
        _unchanged();
    }

    function testBuyerRevokeDoesNotMutateMerchantPolicyHash() public {
        bytes32 hash = bond.policyHash(ID);
        vm.prank(BUYER);
        bond.revoke(ID);
        _authorize(ID, uint64(block.timestamp + 1000));
        require(bond.policyHash(ID) == hash && bond.getQuote(ID).merchantAccepted, "mutable merchant terms");
    }
    function testPreviewRejectsCoverageWithoutChangingProtectedState() public {
        bytes32 id = keccak256("preview-insufficient");
        _policyQuote(id, 140e18, 0, uint64(block.timestamp + 1800));
        _accept(id);
        _authorize(id, uint64(block.timestamp + 1800));
        bytes memory data = _data("1", "1", block.timestamp);
        bytes memory sig = _signature(REQUEST, block.timestamp, data, SIGNER_KEY);
        vm.expectRevert(abi.encodeWithSelector(QuoteBondCoverage.CoverageInsufficient.selector, 15e18, 0));
        bond.preview(id, block.timestamp, data, sig);
        _extraQuoteUnchanged(id, true);
    }
}
