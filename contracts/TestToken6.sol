// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Worthless six-decimal Base Sepolia test asset. Only its immutable deployer can mint.
contract TestToken6 is ERC20 {
    address public immutable minter;
    error OnlyMinter();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) { minter = msg.sender; }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert OnlyMinter();
        _mint(to, amount);
    }
}
