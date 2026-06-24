// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SmartBudgeting {

    enum BudgetStatus { DRAFT, PENDING, VALIDATED, REALIZED, REJECTED }
    enum ValidatorRole { NONE, BAV, ICV }
    enum SectorTag { DEF, EDU, HLT, ICT, INF, SOC }

    struct BudgetAnchor {
        bytes32 budgetHash;
        uint256 amount;
        uint256 timestamp;
        uint256 rejectionCount;
        address submitter;
        BudgetStatus status;
        SectorTag sectorTag;
        bool bavApproved;
        bool icvApproved;
    }

    struct Realization {
        bytes32 evidenceHash;
        uint256 realizationAmount;
        uint256 timestamp;
        address executor;
    }

    address public governanceAdminNode;

    mapping(bytes32 => BudgetAnchor) public anchors;
    mapping(bytes32 => Realization[]) public auditTrail;
    mapping(bytes32 => uint256) public totalRealized;
    mapping(address => ValidatorRole) public validatorRoles;
    mapping(address => SectorTag) public officerSector;
    mapping(address => bool) public authorizedOfficers;

    event SubmissionEvent(bytes32 indexed anchorID, SectorTag sector, uint256 timestamp);
    event PendingEvent(bytes32 indexed anchorID, uint256 timestamp);
    event ValidationEvent(bytes32 indexed anchorID, uint256 timestamp);
    event RejectionEvent(bytes32 indexed anchorID, string reason, uint256 timestamp);
    event RealizationEvent(bytes32 indexed anchorID, uint256 amount, uint256 timestamp);
    event ObserverNodeEvent(bytes32 indexed anchorID, SectorTag sector, uint256 total, uint256 realized, uint256 timestamp);

    modifier onlyGAN() {
        require(msg.sender == governanceAdminNode, "Not GAN");
        _;
    }

    modifier onlyOfficer() {
        require(authorizedOfficers[msg.sender], "Not authorized officer");
        _;
    }

    modifier onlyValidator() {
        require(validatorRoles[msg.sender] != ValidatorRole.NONE, "Not validator");
        _;
    }

    constructor() {
        governanceAdminNode = msg.sender;
    }

    function registerOfficer(address officer, SectorTag sector) external onlyGAN {
        authorizedOfficers[officer] = true;
        officerSector[officer] = sector;
    }

    function registerValidator(address validator, ValidatorRole role) external onlyGAN {
        validatorRoles[validator] = role;
    }

    function submitBudgetAnchor(
        bytes32 budgetHash,
        uint256 amount
    ) external onlyOfficer returns (bytes32) {
        require(amount > 0, "Amount must be > 0");

        bytes32 anchorID = keccak256(abi.encodePacked(budgetHash, msg.sender, block.timestamp));
        require(anchors[anchorID].timestamp == 0, "Duplicate submission");

        anchors[anchorID] = BudgetAnchor({
            budgetHash: budgetHash,
            amount: amount,
            timestamp: block.timestamp,
            rejectionCount: 0,
            submitter: msg.sender,
            status: BudgetStatus.DRAFT,
            sectorTag: officerSector[msg.sender],
            bavApproved: false,
            icvApproved: false
        });

        emit SubmissionEvent(anchorID, officerSector[msg.sender], block.timestamp);

        anchors[anchorID].status = BudgetStatus.PENDING;
        emit PendingEvent(anchorID, block.timestamp);

        return anchorID;
    }

    function validateAnchor(
        bytes32 anchorID,
        bool approved,
        string memory reason
    ) external onlyValidator {
        require(anchors[anchorID].timestamp != 0, "Anchor not found");
        require(
            anchors[anchorID].status == BudgetStatus.PENDING,
            "Not in PENDING state"
        );

        if (!approved) {
            anchors[anchorID].rejectionCount += 1;
            emit RejectionEvent(anchorID, reason, block.timestamp);

            if (anchors[anchorID].rejectionCount > 3) {
                anchors[anchorID].status = BudgetStatus.REJECTED;
            } else {
                anchors[anchorID].status = BudgetStatus.DRAFT;
            }
            return;
        }

        ValidatorRole role = validatorRoles[msg.sender];

        if (role == ValidatorRole.BAV) {
            anchors[anchorID].bavApproved = true;
        } else if (role == ValidatorRole.ICV) {
            anchors[anchorID].icvApproved = true;
        }

        if (anchors[anchorID].bavApproved && anchors[anchorID].icvApproved) {
            anchors[anchorID].status = BudgetStatus.VALIDATED;
            emit ValidationEvent(anchorID, block.timestamp);
        }
    }

    function recordRealization(
        bytes32 anchorID,
        uint256 realizationAmount,
        bytes32 evidenceHash
    ) external onlyGAN {
        require(anchors[anchorID].status == BudgetStatus.VALIDATED, "Must be VALIDATED");
        require(anchors[anchorID].bavApproved && anchors[anchorID].icvApproved, "Dual approval required");
        require(realizationAmount > 0, "Amount must be > 0");
        require(evidenceHash != bytes32(0), "Evidence hash empty");
        require(totalRealized[anchorID] + realizationAmount <= anchors[anchorID].amount, "Exceeds budget");

        auditTrail[anchorID].push(Realization({
            evidenceHash: evidenceHash,
            realizationAmount: realizationAmount,
            timestamp: block.timestamp,
            executor: msg.sender
        }));

        totalRealized[anchorID] += realizationAmount;

        if (totalRealized[anchorID] == anchors[anchorID].amount) {
            anchors[anchorID].status = BudgetStatus.REALIZED;
        }

        emit RealizationEvent(anchorID, realizationAmount, block.timestamp);
        emit ObserverNodeEvent(
            anchorID,
            anchors[anchorID].sectorTag,
            anchors[anchorID].amount,
            totalRealized[anchorID],
            block.timestamp
        );
    }

    function getStatus(bytes32 anchorID) external view returns (BudgetStatus) {
        return anchors[anchorID].status;
    }

    function getAuditLength(bytes32 anchorID) external view returns (uint256) {
        return auditTrail[anchorID].length;
    }

    function getTotalRealized(bytes32 anchorID) external view returns (uint256) {
        return totalRealized[anchorID];
    }
}
