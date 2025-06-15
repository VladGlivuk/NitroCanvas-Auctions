// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract NFTMarketplaceERC7824 is ReentrancyGuard, Ownable, Pausable, EIP712 {
    using ECDSA for bytes32;

    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 startingPrice;
        uint256 minBidIncrement;
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bool isActive;
        bool isERC7824;
    }

    struct Bid {
        string auctionId;
        address bidder;
        uint256 amount;
        uint256 nonce;
        uint256 timestamp;
    }

    // Mapping from auction ID to Auction struct
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => string) public auctionToChannelId; // Map auction ID to ERC-7824 channel ID
    mapping(address => uint256) public bidderNonces; // Track nonces for bid signatures
    mapping(bytes32 => bool) public processedBids; // Prevent bid replay

    uint256 public auctionCount;
    uint256 public platformFee; // in basis points (1% = 100)
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10%

    // EIP-712 type hash for bids
    bytes32 private constant BID_TYPEHASH =
        keccak256(
            "Bid(string auctionId,address bidder,uint256 amount,uint256 nonce,uint256 timestamp)"
        );

    // Events
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        uint256 startTime,
        uint256 endTime,
        bool isERC7824,
        string channelId
    );

    event ERC7824BidVerified(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        bytes32 bidHash
    );

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 platformFeeAmount,
        bool wasERC7824
    );

    event AuctionCancelled(uint256 indexed auctionId);
    event PlatformFeeUpdated(uint256 newFee);
    event ERC7824ChannelUpdated(uint256 indexed auctionId, string channelId);

    constructor() Ownable(msg.sender) EIP712("NFTMarketplaceAuction", "1") {
        platformFee = 250; // 2.5% default platform fee
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setPlatformFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= MAX_PLATFORM_FEE, "Fee too high");
        platformFee = _newFee;
        emit PlatformFeeUpdated(_newFee);
    }

    // Create ERC-7824 enabled auction
    function createERC7824Auction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startingPrice,
        uint256 _minBidIncrement,
        uint256 _duration,
        string memory _channelId
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(_nftContract != address(0), "Invalid NFT contract address");
        require(_startingPrice > 0, "Starting price must be greater than 0");
        require(
            _minBidIncrement > 0,
            "Minimum bid increment must be greater than 0"
        );
        require(_duration > 0 && _duration <= MAX_DURATION, "Invalid duration");
        require(bytes(_channelId).length > 0, "Channel ID required");

        // Check if NFT is approved for transfer
        require(
            IERC721(_nftContract).isApprovedForAll(msg.sender, address(this)) ||
                IERC721(_nftContract).getApproved(_tokenId) == address(this),
            "NFT not approved for transfer"
        );

        // Transfer NFT to this contract
        IERC721(_nftContract).transferFrom(msg.sender, address(this), _tokenId);

        uint256 auctionId = auctionCount++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + _duration;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            startingPrice: _startingPrice,
            minBidIncrement: _minBidIncrement,
            startTime: startTime,
            endTime: endTime,
            highestBidder: address(0),
            highestBid: 0,
            isActive: true,
            isERC7824: true
        });

        auctionToChannelId[auctionId] = _channelId;

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _nftContract,
            _tokenId,
            _startingPrice,
            startTime,
            endTime,
            true,
            _channelId
        );

        return auctionId;
    }

    // Legacy auction creation (backwards compatibility)
    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startingPrice,
        uint256 _minBidIncrement,
        uint256 _duration
    ) external nonReentrant whenNotPaused returns (uint256) {
        return
            _createLegacyAuction(
                _nftContract,
                _tokenId,
                _startingPrice,
                _minBidIncrement,
                _duration
            );
    }

    function _createLegacyAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startingPrice,
        uint256 _minBidIncrement,
        uint256 _duration
    ) internal returns (uint256) {
        require(_nftContract != address(0), "Invalid NFT contract address");
        require(_startingPrice > 0, "Starting price must be greater than 0");
        require(
            _minBidIncrement > 0,
            "Minimum bid increment must be greater than 0"
        );
        require(_duration > 0 && _duration <= MAX_DURATION, "Invalid duration");

        // Check if NFT is approved for transfer
        require(
            IERC721(_nftContract).isApprovedForAll(msg.sender, address(this)) ||
                IERC721(_nftContract).getApproved(_tokenId) == address(this),
            "NFT not approved for transfer"
        );

        // Transfer NFT to this contract
        IERC721(_nftContract).transferFrom(msg.sender, address(this), _tokenId);

        uint256 auctionId = auctionCount++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + _duration;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: _nftContract,
            tokenId: _tokenId,
            startingPrice: _startingPrice,
            minBidIncrement: _minBidIncrement,
            startTime: startTime,
            endTime: endTime,
            highestBidder: address(0),
            highestBid: 0,
            isActive: true,
            isERC7824: false
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _nftContract,
            _tokenId,
            _startingPrice,
            startTime,
            endTime,
            false,
            ""
        );

        return auctionId;
    }

    // Legacy bid placement (for non-ERC7824 auctions)
    function placeBid(
        uint256 _auctionId
    ) external payable nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(!auction.isERC7824, "Use ERC-7824 bidding for this auction");
        require(
            block.timestamp >= auction.startTime,
            "Auction has not started"
        );
        require(block.timestamp <= auction.endTime, "Auction has ended");
        require(
            msg.value >= auction.startingPrice,
            "Bid must be at least starting price"
        );
        require(
            msg.value >= auction.highestBid + auction.minBidIncrement,
            "Bid must be higher than current highest bid plus minimum increment"
        );

        // Store previous bidder and amount for refund
        address previousBidder = auction.highestBidder;
        uint256 previousBid = auction.highestBid;

        // Update auction state
        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        // Refund previous highest bidder if exists
        if (previousBidder != address(0)) {
            (bool success, ) = payable(previousBidder).call{value: previousBid}(
                ""
            );
            require(success, "Refund failed");
        }
    }

    // Verify and process ERC-7824 bid signature
    function verifyERC7824Bid(
        uint256 _auctionId,
        string memory _auctionIdStr,
        address _bidder,
        uint256 _amount,
        uint256 _nonce,
        uint256 _timestamp,
        bytes memory _signature
    ) external view returns (bool) {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(auction.isERC7824, "Not an ERC-7824 auction");
        require(
            block.timestamp >= auction.startTime,
            "Auction has not started"
        );
        require(block.timestamp <= auction.endTime, "Auction has ended");
        require(
            _amount >= auction.startingPrice,
            "Bid must be at least starting price"
        );
        require(
            _amount >= auction.highestBid + auction.minBidIncrement,
            "Bid must be higher than current highest bid plus minimum increment"
        );
        require(_nonce > bidderNonces[_bidder], "Invalid nonce");

        // Create bid hash
        bytes32 structHash = keccak256(
            abi.encode(
                BID_TYPEHASH,
                keccak256(bytes(_auctionIdStr)),
                _bidder,
                _amount,
                _nonce,
                _timestamp
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(_signature);

        return signer == _bidder;
    }

    // Settle ERC-7824 auction with winning bid
    function settleERC7824Auction(
        uint256 _auctionId,
        string memory _auctionIdStr,
        address _winningBidder,
        uint256 _winningAmount,
        uint256 _nonce,
        uint256 _timestamp,
        bytes memory _signature
    ) external nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(auction.isERC7824, "Not an ERC-7824 auction");
        require(block.timestamp > auction.endTime, "Auction has not ended");

        // Verify the winning bid signature if there is a winner
        if (_winningBidder != address(0) && _winningAmount > 0) {
            require(
                verifyERC7824Bid(
                    _auctionId,
                    _auctionIdStr,
                    _winningBidder,
                    _winningAmount,
                    _nonce,
                    _timestamp,
                    _signature
                ),
                "Invalid winning bid signature"
            );

            // Create bid hash and mark as processed
            bytes32 bidHash = keccak256(
                abi.encode(
                    _auctionId,
                    _winningBidder,
                    _winningAmount,
                    _nonce,
                    _timestamp
                )
            );
            require(!processedBids[bidHash], "Bid already processed");
            processedBids[bidHash] = true;

            // Update bidder nonce
            bidderNonces[_winningBidder] = _nonce;

            emit ERC7824BidVerified(
                _auctionId,
                _winningBidder,
                _winningAmount,
                bidHash
            );
        }

        auction.isActive = false;
        auction.highestBidder = _winningBidder;
        auction.highestBid = _winningAmount;

        if (_winningBidder != address(0) && _winningAmount > 0) {
            // Calculate platform fee
            uint256 feeAmount = (_winningAmount * platformFee) / 10000;
            uint256 sellerAmount = _winningAmount - feeAmount;

            // Transfer NFT to winner
            IERC721(auction.nftContract).transferFrom(
                address(this),
                _winningBidder,
                auction.tokenId
            );

            // Transfer funds to seller and platform
            (bool success1, ) = payable(auction.seller).call{
                value: sellerAmount
            }("");
            require(success1, "Transfer to seller failed");

            (bool success2, ) = payable(owner()).call{value: feeAmount}("");
            require(success2, "Transfer to platform failed");

            emit AuctionSettled(
                _auctionId,
                _winningBidder,
                _winningAmount,
                feeAmount,
                true
            );
        } else {
            // No winning bid, return NFT to seller
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );

            emit AuctionSettled(_auctionId, address(0), 0, 0, true);
        }
    }

    // Legacy auction completion
    function completeAuction(
        uint256 _auctionId
    ) external nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(
            !auction.isERC7824,
            "Use settleERC7824Auction for ERC-7824 auctions"
        );
        require(block.timestamp > auction.endTime, "Auction has not ended");

        auction.isActive = false;

        if (auction.highestBidder != address(0)) {
            // Calculate platform fee
            uint256 feeAmount = (auction.highestBid * platformFee) / 10000;
            uint256 sellerAmount = auction.highestBid - feeAmount;

            // Transfer NFT to winner
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            // Transfer funds to seller and platform
            (bool success1, ) = payable(auction.seller).call{
                value: sellerAmount
            }("");
            require(success1, "Transfer to seller failed");

            (bool success2, ) = payable(owner()).call{value: feeAmount}("");
            require(success2, "Transfer to platform failed");

            emit AuctionSettled(
                _auctionId,
                auction.highestBidder,
                auction.highestBid,
                feeAmount,
                false
            );
        } else {
            // No bids, return NFT to seller
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );

            emit AuctionSettled(_auctionId, address(0), 0, 0, false);
        }
    }

    // Cancel auction (only seller or owner)
    function cancelAuction(
        uint256 _auctionId
    ) external nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(
            msg.sender == auction.seller || msg.sender == owner(),
            "Only seller or owner can cancel"
        );

        auction.isActive = false;

        // Return NFT to seller
        IERC721(auction.nftContract).transferFrom(
            address(this),
            auction.seller,
            auction.tokenId
        );

        // Refund highest bidder if exists (only for legacy auctions)
        if (!auction.isERC7824 && auction.highestBidder != address(0)) {
            (bool success, ) = payable(auction.highestBidder).call{
                value: auction.highestBid
            }("");
            require(success, "Refund failed");
        }

        emit AuctionCancelled(_auctionId);
    }

    // Update ERC-7824 channel ID
    function updateChannelId(
        uint256 _auctionId,
        string memory _newChannelId
    ) external {
        Auction storage auction = auctions[_auctionId];
        require(auction.isERC7824, "Not an ERC-7824 auction");
        require(
            msg.sender == auction.seller || msg.sender == owner(),
            "Only seller or owner can update channel"
        );
        require(bytes(_newChannelId).length > 0, "Channel ID required");

        auctionToChannelId[_auctionId] = _newChannelId;
        emit ERC7824ChannelUpdated(_auctionId, _newChannelId);
    }

    // View functions
    function getAuction(
        uint256 _auctionId
    )
        external
        view
        returns (
            address seller,
            address nftContract,
            uint256 tokenId,
            uint256 startingPrice,
            uint256 minBidIncrement,
            uint256 startTime,
            uint256 endTime,
            address highestBidder,
            uint256 highestBid,
            bool isActive,
            bool isERC7824,
            string memory channelId
        )
    {
        Auction storage auction = auctions[_auctionId];
        return (
            auction.seller,
            auction.nftContract,
            auction.tokenId,
            auction.startingPrice,
            auction.minBidIncrement,
            auction.startTime,
            auction.endTime,
            auction.highestBidder,
            auction.highestBid,
            auction.isActive,
            auction.isERC7824,
            auctionToChannelId[_auctionId]
        );
    }

    function getBidderNonce(address _bidder) external view returns (uint256) {
        return bidderNonces[_bidder];
    }

    function isBidProcessed(bytes32 _bidHash) external view returns (bool) {
        return processedBids[_bidHash];
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}(
            ""
        );
        require(success, "Withdrawal failed");
    }

    // Allow contract to receive ETH for settlement payments
    receive() external payable {}
}
