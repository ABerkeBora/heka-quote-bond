// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AirnodeV2Attestation} from "./vendor/AirnodeV2Attestation.sol";
import {ProjectedJson} from "./vendor/ProjectedJson.sol";

/// @title Quote Bond: exact invoice payment with a separately funded, capped USD shortfall reserve
/// @notice Test-token settlement only. No fiat redemption, work-quality adjudication or unlimited USD guarantee.
/// The source, two assets and verification policy are immutable. Anyone can submit a response, but neither the
/// beneficiary nor the quote terms can be changed after funding. The payer authorizes the exact quote on-chain.
contract QuoteBond is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { None, Funded, Active, Settled, Capped, Voided }

    struct Quote {
        address payer;
        address beneficiary;
        address funder;
        uint256 quoteUsd18;
        uint256 escrowAmount;
        uint256 reservedUsdt;
        uint64 createdAt;
        uint64 settleAfter;
        uint64 normalDeadline;
        uint64 hardDeadline;
        uint64 mandateExpiry;
        State state;
        uint256 paidUsdt;
        uint256 uncoveredUsd18;
    }

    struct Calculation {
        uint256 usdcPrice18;
        uint256 usdtPrice18;
        uint256 usdcObservedAt;
        uint256 usdtObservedAt;
        uint256 escrowUsd18;
        uint256 shortfallUsd18;
        uint256 requestedUsdt;
        uint256 paidUsdt;
        uint256 uncoveredUsd18;
    }

    error InvalidTerms();
    error QuoteAlreadyExists();
    error QuoteNotActive();
    error OnlyPayer();
    error MandateExpired();
    error OutsideSettlementWindow();
    error ResponseTooOld(uint256 timestamp);
    error FutureTimestamp(uint256 timestamp);
    error SourceTooOld(string feed, uint256 timestamp);
    error InvalidPrice();
    error NotYetVoidable();
    error NonExactTransfer();

    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    address public immutable airnode;
    bytes32 public immutable requestHash;

    uint256 public constant MAX_RESPONSE_AGE = 120;
    uint256 public constant MAX_SOURCE_AGE = 300;
    uint256 public constant CLOCK_SKEW = 60;
    uint256 public constant MAX_MANDATE_DURATION = 30 minutes;
    uint256 public constant MAX_QUOTE_DURATION = 45 minutes;
    uint256 public constant TOKEN_SCALE = 1e6;
    uint256 public totalReservedUsdt;

    mapping(bytes32 => Quote) private quotes;

    event QuoteFunded(bytes32 indexed quoteId, address indexed payer, address indexed beneficiary,
        address funder, uint256 quoteUsd18, uint256 escrowAmount, uint256 reservedUsdt,
        uint64 settleAfter, uint64 normalDeadline, uint64 hardDeadline);
    event MandateAuthorized(bytes32 indexed quoteId, address indexed payer, uint256 exactAmount, uint64 expiry);
    event MandateRevoked(bytes32 indexed quoteId);
    event QuotePaid(bytes32 indexed quoteId, address indexed beneficiary, address indexed executor,
        State state, uint256 paidUsdc, uint256 paidUsdt, uint256 uncoveredUsd18,
        uint256 usdcPrice18, uint256 usdtPrice18, uint256 responseTimestamp);
    event ReserveReturned(bytes32 indexed quoteId, address indexed funder, uint256 amount);
    event QuoteVoided(bytes32 indexed quoteId);

    constructor(address usdc_, address usdt_, address airnode_, bytes32 requestHash_) {
        if (usdc_ == address(0) || usdt_ == address(0) || usdc_ == usdt_ || airnode_ == address(0)
            || requestHash_ == bytes32(0) || IERC20Metadata(usdc_).decimals() != 6
            || IERC20Metadata(usdt_).decimals() != 6) revert InvalidTerms();
        usdc = IERC20(usdc_);
        usdt = IERC20(usdt_);
        airnode = airnode_;
        requestHash = requestHash_;
    }

    /// @notice Fund a new immutable quote; each quote receives its own reserve transfer.
    /// @dev USDC stays in the payer's wallet until a single atomic, verified payment. No pre-payment refund needed.
    function createQuote(bytes32 id, address payer, address beneficiary, uint256 quoteUsd18,
        uint256 escrowAmount, uint256 reserveAmount, uint64 settleAfter, uint64 normalDeadline,
        uint64 hardDeadline) external nonReentrant {
        if (quotes[id].state != State.None) revert QuoteAlreadyExists();
        if (id == bytes32(0) || payer == address(0) || beneficiary == address(0) || beneficiary == payer
            || beneficiary == address(this) || quoteUsd18 == 0 || escrowAmount == 0 || reserveAmount == 0
            || normalDeadline <= block.timestamp || normalDeadline < settleAfter || hardDeadline <= normalDeadline
            || hardDeadline > block.timestamp + MAX_QUOTE_DURATION) revert InvalidTerms();

        quotes[id] = Quote({payer: payer, beneficiary: beneficiary, funder: msg.sender,
            quoteUsd18: quoteUsd18, escrowAmount: escrowAmount, reservedUsdt: reserveAmount,
            createdAt: uint64(block.timestamp), settleAfter: settleAfter, normalDeadline: normalDeadline,
            hardDeadline: hardDeadline, mandateExpiry: 0, state: State.Funded, paidUsdt: 0, uncoveredUsd18: 0});
        totalReservedUsdt += reserveAmount;
        uint256 balanceBefore = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(msg.sender, address(this), reserveAmount);
        if (usdt.balanceOf(address(this)) != balanceBefore + reserveAmount) revert NonExactTransfer();
        emit QuoteFunded(id, payer, beneficiary, msg.sender, quoteUsd18, escrowAmount, reserveAmount,
            settleAfter, normalDeadline, hardDeadline);
    }

    /// @notice The payer delegates exactly this quote, its immutable recipient/assets and one payment, on this chain.
    /// @dev No unlimited allowance is created here; the separate ERC20 approval should be the exact escrow amount.
    function authorize(bytes32 id, uint64 expiry, uint256 maxAmount) external {
        Quote storage q = quotes[id];
        if (q.state != State.Funded && q.state != State.Active) revert QuoteNotActive();
        if (msg.sender != q.payer) revert OnlyPayer();
        if (maxAmount != q.escrowAmount || expiry <= block.timestamp || expiry > q.hardDeadline
            || expiry > block.timestamp + MAX_MANDATE_DURATION) revert InvalidTerms();
        q.mandateExpiry = expiry;
        q.state = State.Active;
        emit MandateAuthorized(id, msg.sender, maxAmount, expiry);
    }

    function revoke(bytes32 id) external {
        Quote storage q = quotes[id];
        if (q.state != State.Active) revert QuoteNotActive();
        if (msg.sender != q.payer) revert OnlyPayer();
        q.mandateExpiry = 0;
        q.state = State.Funded;
        emit MandateRevoked(id);
    }

    function getQuote(bytes32 id) external view returns (Quote memory) { return quotes[id]; }

    /// @notice Includes the same authorization, signer, request, timing and amount checks as payment.
    function preview(bytes32 id, uint256 timestamp, bytes calldata data, bytes calldata signature)
        external view returns (Calculation memory) {
        return _check(quotes[id], timestamp, data, signature);
    }

    /// @notice Permissionless submission; only the pinned beneficiary can receive the invoice and top-up.
    /// Verification and arithmetic finish before any protected token balance or state is changed.
    function payApprovedQuote(bytes32 id, uint256 timestamp, bytes calldata data, bytes calldata signature)
        external nonReentrant {
        Quote storage q = quotes[id];
        Calculation memory c = _check(q, timestamp, data, signature);
        q.state = c.requestedUsdt > q.reservedUsdt ? State.Capped : State.Settled;
        q.paidUsdt = c.paidUsdt;
        q.uncoveredUsd18 = c.uncoveredUsd18;
        totalReservedUsdt -= q.reservedUsdt;

        uint256 beforeUsdc = usdc.balanceOf(q.beneficiary);
        usdc.safeTransferFrom(q.payer, q.beneficiary, q.escrowAmount);
        if (usdc.balanceOf(q.beneficiary) != beforeUsdc + q.escrowAmount) revert NonExactTransfer();
        if (c.paidUsdt != 0) usdt.safeTransfer(q.beneficiary, c.paidUsdt);
        uint256 unused = q.reservedUsdt - c.paidUsdt;
        if (unused != 0) {
            usdt.safeTransfer(q.funder, unused);
            emit ReserveReturned(id, q.funder, unused);
        }
        emit QuotePaid(id, q.beneficiary, msg.sender, q.state, q.escrowAmount, c.paidUsdt,
            c.uncoveredUsd18, c.usdcPrice18, c.usdtPrice18, timestamp);
    }

    /// @notice No-data deadline: never debit USDC; return the separately funded reserve to its original funder.
    function voidQuote(bytes32 id) external nonReentrant {
        Quote storage q = quotes[id];
        if (q.state != State.Funded && q.state != State.Active) revert QuoteNotActive();
        if (block.timestamp <= q.hardDeadline) revert NotYetVoidable();
        q.state = State.Voided;
        totalReservedUsdt -= q.reservedUsdt;
        usdt.safeTransfer(q.funder, q.reservedUsdt);
        emit ReserveReturned(id, q.funder, q.reservedUsdt);
        emit QuoteVoided(id);
    }

    function _check(Quote storage q, uint256 timestamp, bytes calldata data, bytes calldata signature)
        internal view returns (Calculation memory c) {
        if (q.state != State.Active) revert QuoteNotActive();
        if (block.timestamp >= q.mandateExpiry) revert MandateExpired();
        if (block.timestamp < q.settleAfter || block.timestamp > q.hardDeadline) revert OutsideSettlementWindow();
        AirnodeV2Attestation.verify(airnode, requestHash, timestamp, data, signature);
        if (timestamp > block.timestamp + CLOCK_SKEW) revert FutureTimestamp(timestamp);
        if (timestamp < block.timestamp && block.timestamp - timestamp > MAX_RESPONSE_AGE)
            revert ResponseTooOld(timestamp);
        // A quote uses the first fresh snapshot submitted in its agreed settlement window, not a retroactive price.
        if (timestamp + CLOCK_SKEW < q.settleAfter) revert OutsideSettlementWindow();

        c.usdcPrice18 = ProjectedJson.readUint(data, "usdc", 18);
        c.usdtPrice18 = ProjectedJson.readUint(data, "usdt", 18);
        c.usdcObservedAt = ProjectedJson.readUint(data, "usdcUpdatedAt", 0) / 1000;
        c.usdtObservedAt = ProjectedJson.readUint(data, "usdtUpdatedAt", 0) / 1000;
        if (c.usdcPrice18 == 0 || c.usdtPrice18 == 0 || c.usdcPrice18 > 1e24 || c.usdtPrice18 > 1e24)
            revert InvalidPrice();
        _sourceTime("USDC/USD", c.usdcObservedAt, timestamp);
        _sourceTime("USDT/USD", c.usdtObservedAt, timestamp);
        c.escrowUsd18 = Math.mulDiv(q.escrowAmount, c.usdcPrice18, TOKEN_SCALE);
        c.shortfallUsd18 = q.quoteUsd18 > c.escrowUsd18 ? q.quoteUsd18 - c.escrowUsd18 : 0;
        c.requestedUsdt = Math.mulDiv(c.shortfallUsd18, TOKEN_SCALE, c.usdtPrice18, Math.Rounding.Ceil);
        c.paidUsdt = Math.min(c.requestedUsdt, q.reservedUsdt);
        uint256 covered = c.escrowUsd18 + Math.mulDiv(c.paidUsdt, c.usdtPrice18, TOKEN_SCALE);
        c.uncoveredUsd18 = q.quoteUsd18 > covered ? q.quoteUsd18 - covered : 0;
    }

    function _sourceTime(string memory feed, uint256 observedAt, uint256 envelopeTimestamp) private view {
        if (observedAt == 0 || (observedAt < block.timestamp && block.timestamp - observedAt > MAX_SOURCE_AGE))
            revert SourceTooOld(feed, observedAt);
        if (observedAt > block.timestamp + CLOCK_SKEW || observedAt > envelopeTimestamp + CLOCK_SKEW)
            revert FutureTimestamp(observedAt);
    }
}
