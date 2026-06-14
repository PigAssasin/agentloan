// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * PriceOraclePyth — wraps Pyth Network for real-time on-chain prices.
 *
 * Drop-in replacement for PriceOracle.sol — same getPrice(token) interface.
 * Uses Pyth pull oracle: prices are updated on every transaction by the caller,
 * or refreshed periodically via updatePrices() script.
 *
 * Pyth on Arc Testnet: 0x2880aB155794e7179c9eE2e38200202908C17B43
 */
contract PriceOraclePyth is Ownable {
    IPyth public immutable pyth;

    uint256 public constant DEFAULT_STALENESS = 3600;   // 1 hour default
    uint256 public constant STABLE_STALENESS  = 86400;  // 24 hours for stable/slow feeds (EUR)

    mapping(address => bytes32)  public priceIds;    // token → Pyth price ID
    mapping(address => uint256)  public stalenessMap; // token → custom max staleness (0 = use default)

    error FeedNotFound(address token);
    error StalePrice(address token, uint256 age);
    error NegativePrice(address token);

    event FeedSet(address indexed token, bytes32 indexed priceId);
    event StalenessSet(address indexed token, uint256 maxAge);

    constructor(address pythContract_) Ownable(msg.sender) {
        pyth = IPyth(pythContract_);
    }

    // ── Owner config ──────────────────────────────────────────────────────────

    function setFeed(address token, bytes32 priceId) external onlyOwner {
        require(token != address(0), "zero token");
        priceIds[token] = priceId;
        emit FeedSet(token, priceId);
    }

    function setStaleness(address token, uint256 maxAge) external onlyOwner {
        stalenessMap[token] = maxAge;
        emit StalenessSet(token, maxAge);
    }

    // ── Update prices on-chain (call with msg.value >= getUpdateFee) ──────────

    function updatePrices(bytes[] calldata priceUpdateData) external payable {
        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        pyth.updatePriceFeeds{value: fee}(priceUpdateData);
    }

    function getUpdateFee(bytes[] calldata priceUpdateData) external view returns (uint256) {
        return pyth.getUpdateFee(priceUpdateData);
    }

    // ── Price reads ───────────────────────────────────────────────────────────

    // Returns price normalized to WAD (1e18) — same interface as PriceOracle.sol
    function getPrice(address token) external view returns (uint256) {
        bytes32 priceId = priceIds[token];
        if (priceId == bytes32(0)) revert FeedNotFound(token);

        uint256 maxAge = stalenessMap[token] > 0 ? stalenessMap[token] : DEFAULT_STALENESS;
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(priceId, maxAge);

        if (p.price <= 0) revert NegativePrice(token);

        // Pyth price: actual_price = rawPrice × 10^expo
        // Normalize to WAD (1e18): priceWAD = rawPrice × 10^(18 + expo)  [expo >= 0]
        //                          priceWAD = rawPrice × 1e18 / 10^(-expo) [expo < 0]
        uint256 rawPrice = uint256(uint64(p.price));
        uint256 priceWAD;
        if (p.expo >= 0) {
            uint256 scale = 18 + uint256(uint32(p.expo));
            priceWAD = rawPrice * (10 ** scale);
        } else {
            uint256 divisor = 10 ** uint256(uint32(-p.expo));
            priceWAD = (rawPrice * 1e18) / divisor;
        }
        return priceWAD;
    }

    // Emergency withdrawal of any ETH used for Pyth fees
    function withdrawFees() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "transfer failed");
    }

    receive() external payable {}
}
