// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTMarketplace is ReentrancyGuard, Ownable {
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
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);

    constructor() Ownable(msg.sender) {}

    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startingPrice,
        uint256 _minBidIncrement,
        uint256 _duration
    ) external nonReentrant returns (uint256) {
        require(_startingPrice > 0, "Starting price must be greater than 0");
        require(_minBidIncrement > 0, "Minimum bid increment must be greater than 0");
        require(_duration > 0, "Duration must be greater than 0");

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

    function placeBid(uint256 _auctionId) external payable nonReentrant {
        Auction storage auction = auctions[_auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp >= auction.startTime, "Auction has not started");
        require(block.timestamp <= auction.endTime, "Auction has ended");
        require(msg.value >= auction.startingPrice, "Bid must be at least starting price");
        require(
            msg.value >= auction.highestBid + auction.minBidIncrement,
            "Bid must be higher than current highest bid plus minimum increment"
        );

        // Refund previous highest bidder if exists
        if (auction.highestBidder != address(0)) {
            payable(auction.highestBidder).transfer(auction.highestBid);
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        emit BidPlaced(_auctionId, msg.sender, msg.value);

        // Check if auction should end
        if (block.timestamp >= auction.endTime) {
            _completeAuction(_auctionId);
        }
    }

    function completeAuction(uint256 _auctionId) external nonReentrant {
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
            // Transfer NFT to winner
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            // Transfer funds to seller
            payable(auction.seller).transfer(auction.highestBid);

            emit AuctionCompleted(_auctionId, auction.highestBidder, auction.highestBid);
        } else {
            // No bids, return NFT to seller
            IERC721(auction.nftContract).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
    }

    function cancelAuction(uint256 _auctionId) external nonReentrant {
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
            payable(auction.highestBidder).transfer(auction.highestBid);
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
} 