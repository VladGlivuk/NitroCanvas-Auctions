// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract NFTMarketplace is ReentrancyGuard, Ownable, Pausable {
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
    }

    // Mapping from auction ID to Auction struct
    mapping(uint256 => Auction) public auctions;
    uint256 public auctionCount;
    uint256 public platformFee; // in basis points (1% = 100)
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10%

    // Events
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        uint256 startTime,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionCompleted(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount,
        uint256 platformFeeAmount
    );

    event AuctionCancelled(uint256 indexed auctionId);
    event PlatformFeeUpdated(uint256 newFee);

    constructor() Ownable(msg.sender) {
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

    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startingPrice,
        uint256 _minBidIncrement,
        uint256 _duration
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(_nftContract != address(0), "Invalid NFT contract address");
        require(_startingPrice > 0, "Starting price must be greater than 0");
        require(_minBidIncrement > 0, "Minimum bid increment must be greater than 0");
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
            isActive: true
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _nftContract,
            _tokenId,
            _startingPrice,
            startTime,
            endTime
        );

        return auctionId;
    }

    function placeBid(uint256 _auctionId) external payable nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp >= auction.startTime, "Auction has not started");
        require(block.timestamp <= auction.endTime, "Auction has ended");
        require(msg.value >= auction.startingPrice, "Bid must be at least starting price");
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

        emit BidPlaced(_auctionId, msg.sender, msg.value);

        // Refund previous highest bidder if exists
        if (previousBidder != address(0)) {
            (bool success, ) = payable(previousBidder).call{value: previousBid}("");
            require(success, "Refund failed");
        }

        // Check if auction should end
        if (block.timestamp >= auction.endTime) {
            _completeAuction(_auctionId);
        }
    }

    function completeAuction(uint256 _auctionId) external nonReentrant whenNotPaused {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp > auction.endTime, "Auction has not ended");
        _completeAuction(_auctionId);
    }

    function _completeAuction(uint256 _auctionId) private {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");

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
            (bool success1, ) = payable(auction.seller).call{value: sellerAmount}("");
            require(success1, "Transfer to seller failed");
            
            (bool success2, ) = payable(owner()).call{value: feeAmount}("");
            require(success2, "Transfer to platform failed");

            emit AuctionCompleted(_auctionId, auction.highestBidder, auction.highestBid, feeAmount);
        } else {
            // No bids, return NFT to seller
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
    }

    function cancelAuction(uint256 _auctionId) external nonReentrant whenNotPaused {
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

        // Refund highest bidder if exists
        if (auction.highestBidder != address(0)) {
            (bool success, ) = payable(auction.highestBidder).call{value: auction.highestBid}("");
            require(success, "Refund failed");
        }

        emit AuctionCancelled(_auctionId);
    }

    // View functions
    function getAuction(uint256 _auctionId)
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
            bool isActive
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
            auction.isActive
        );
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }
}